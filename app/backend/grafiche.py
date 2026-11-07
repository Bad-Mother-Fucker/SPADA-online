"""Grafiche della relazione tecnica (Fase 7).

Per ogni proposta approvata il professionista può chiedere una o più
figure. Ogni figura passa da tre momenti:

1. richiesta: cosa deve mostrare, scritta dal professionista;
2. prompt: Claude, in sola lettura sul workspace della gara, legge la
   proposta, i gap collegati e gli elaborati citati e scrive un prompt
   dettagliato per il modello d'immagine, più una didascalia;
3. immagine: generata con le API di OpenAI se la chiave c'è, altrimenti
   caricata a mano dopo averla ottenuta da ChatGPT con lo stesso prompt.

Preparazione del prompt e generazione durano da decine di secondi a un
paio di minuti: girano in un thread del backend, non nella coda del
worker (che esegue un job alla volta e potrebbe essere occupato per
mezz'ora da un deliverable). Lo stato dell'operazione sta nel registro;
se il backend si riavvia a metà, l'operazione risulta interrotta (il
thread non c'è più) e si riprova dall'interfaccia.

Il registro è in grafiche_offerta.py (_pipeline), condiviso con chi
scrive la relazione e con l'esportazione.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

from auth import get_claude_env
from paths import SPADA_CLAUDE
import immagini_openai
import riferimenti

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_pipeline" / "scripts" / "setup"))
import deliverables_offerta as offerta  # noqa: E402
import grafiche_offerta as registro  # noqa: E402

log = logging.getLogger("spada.grafiche")

TIMEOUT_PROMPT = 8 * 60
MAX_IMMAGINE = 20 * 1024 * 1024
TOOLS_CONSENTITI = "Read,Grep,Glob"
TOOLS_VIETATI = "Write,Edit,Bash,Task,Agent,NotebookEdit"
# Istruzione per il riferimento caricato dal professionista prima che Claude lo veda.
RIF_PREDEFINITO = ("Use the attached image as a visual reference for layout, proportions and viewpoint. "
                   "Where the attached image and the text differ, follow the text.")

_lock = threading.Lock()
_in_corso: set[tuple[str, str, str]] = set()  # (cartella gara, cartella deliverable, id figura)


class ErroreGrafica(Exception):
    def __init__(self, codice: int, messaggio: str):
        super().__init__(messaggio)
        self.codice = codice


def _ora() -> str:
    return registro.ora()


# ── Lettura ─────────────────────────────────────────────────────────
def _approvate(gara: Path) -> dict[str, dict]:
    return {p["id"]: {**p, "titolo": _titolo(p["titolo"]), "criterio": p["id"].split("-")[1]}
            for p in offerta.proposte_decise(gara)["approvate"]}


def _titolo(t: str) -> str:
    """Il frontmatter si legge senza parser YAML: «classe \\"extra\\"» arriva
    come «classe \\"extra\\» (la virgoletta finale è andata con quelle esterne)."""
    if '\\"' not in t:
        return t
    t = t.replace('\\"', '"')
    return t[:-1] + '"' if t.endswith("\\") else t


def _testi(gara: Path, dl: dict) -> dict[str, list[str] | None]:
    """Figure collocate nella bozza e nel definitivo (None se il file non c'è)."""
    out = {}
    for sid, _, nome in offerta.stadi_di(dl["tipo"]):
        if sid in ("bozza", "definitivo") and nome:
            f = gara / dl["cartella"] / nome
            out[sid] = registro.segnaposti(f.read_text(encoding="utf-8")) if f.is_file() else None
    return out


def _vista(gara: Path, dl: dict, g: dict, approvate: dict, testi: dict) -> dict:
    chiave = (str(gara), dl["cartella"], g["id"])
    op = g.get("operazione")
    errore = g.get("errore")
    if op and chiave not in _in_corso:
        # Thread sparito: il backend è stato riavviato durante l'operazione.
        errore = {"tipo": "interrotta", "operazione": op["tipo"],
                  "messaggio": "Operazione interrotta da un riavvio di SPADA: riprova."}
        op = None
    immagine = g.get("immagine")
    rif = g.get("riferimento") if _file_riferimento(gara, dl, g) else None
    avvisi = []
    if (interni := offerta.riferimenti_interni(g.get("didascalia") or "")):
        avvisi.append(f"La didascalia contiene codici interni ({', '.join(interni)}): toglili, finisce nel documento.")
    return {
        "id": g["id"], "proposta_id": g["proposta_id"],
        "proposta_approvata": g["proposta_id"] in approvate,
        "richiesta": g.get("richiesta", ""), "prompt": g.get("prompt", ""),
        "didascalia": g.get("didascalia", ""), "note_prompt": g.get("note_prompt", ""),
        "prompt_preparato_il": g.get("prompt_preparato_il"),
        "immagine": ({"origine": g.get("origine"), "modello": g.get("modello"), "caricata_il": g.get("immagine_il"),
                      "nome": Path(immagine).name} if immagine and (gara / dl["cartella"] / immagine).is_file() else None),
        "operazione": op, "errore": errore,
        "collocata": {sid: (None if ids is None else g["id"] in ids) for sid, ids in testi.items()},
        "avvisi": avvisi, "creata_il": g.get("creata_il"),
        "riferimento": ({"origine": rif["origine"], "fonte": riferimenti.nome_leggibile(rif["file"]) if rif.get("file") else None,
                         "pagina": rif.get("pagina"), "riquadro": rif.get("riquadro"), "motivo": rif.get("motivo", ""),
                         "impostato_il": rif.get("impostato_il"), "cambiato_dopo_prompt": bool(rif.get("cambiato_dopo_prompt"))}
                        if rif else None),
        "usa_riferimento": g.get("usa_riferimento", True),
        "prompt_riferimento": g.get("prompt_riferimento", ""),
        "prompt_effettivo": prompt_effettivo(gara, dl, g),
    }


def _file_riferimento(gara: Path, dl: dict, g: dict) -> Path | None:
    rif = g.get("riferimento") or {}
    f = gara / dl["cartella"] / rif["immagine"] if rif.get("immagine") else None
    return f if f and f.is_file() else None


def prompt_effettivo(gara: Path, dl: dict, g: dict) -> str:
    """Il prompt da usare: con il riferimento attivo, seguito dall'istruzione su come usarlo."""
    base = (g.get("prompt") or "").strip()
    if base and g.get("usa_riferimento", True) and _file_riferimento(gara, dl, g):
        return f"{base}\n\n{(g.get('prompt_riferimento') or RIF_PREDEFINITO).strip()}"
    return base


def elenco(gara: Path, dl: dict) -> dict:
    approvate = _approvate(gara)
    testi = _testi(gara, dl)
    dati = registro.leggi(gara, dl["cartella"])
    return {
        "proposte": list(approvate.values()),
        "grafiche": [_vista(gara, dl, g, approvate, testi) for g in dati["grafiche"]],
        "openai": {k: v for k, v in immagini_openai.stato().items() if k in ("configurata", "modello")},
        "testi": {sid: ids is not None for sid, ids in testi.items()},
    }


# ── Modifiche al registro ───────────────────────────────────────────
def _modifica(gara: Path, dl: dict, gid: str | None, fn):
    """Legge, applica fn(dati, figura) e scrive, sotto lock. Restituisce
    quello che restituisce fn."""
    with _lock:
        dati = registro.leggi(gara, dl["cartella"])
        g = None
        if gid is not None:
            g = next((x for x in dati["grafiche"] if x["id"] == gid), None)
            if g is None:
                raise ErroreGrafica(404, f"Figura {gid} non trovata.")
        esito = fn(dati, g)
        registro.scrivi(gara, dl["cartella"], dati)
        return esito


def _occupata(gara: Path, dl: dict, g: dict) -> bool:
    return bool(g.get("operazione")) and (str(gara), dl["cartella"], g["id"]) in _in_corso


def crea(gara: Path, dl: dict, proposta_id: str, richiesta: str) -> dict:
    if proposta_id not in _approvate(gara):
        raise ErroreGrafica(409, "Le figure si aggiungono solo alle proposte approvate.")

    def fn(dati, _):
        gid = f"fig-{dati['prossimo']:02d}"
        dati["prossimo"] += 1
        g = {"id": gid, "proposta_id": proposta_id, "richiesta": richiesta.strip(), "prompt": "", "didascalia": "",
             "creata_il": _ora()}
        dati["grafiche"].append(g)
        return gid
    return _modifica(gara, dl, None, fn)


def aggiorna(gara: Path, dl: dict, gid: str, campi: dict):
    def fn(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "Aspetta che finisca l'operazione in corso su questa figura.")
        for k in ("richiesta", "prompt", "didascalia", "prompt_riferimento"):
            if campi.get(k) is not None:
                g[k] = campi[k].strip()
        if campi.get("usa_riferimento") is not None:
            g["usa_riferimento"] = bool(campi["usa_riferimento"])
        g["aggiornata_il"] = _ora()
    _modifica(gara, dl, gid, fn)


def _archivia_immagine(gara: Path, dl: dict, g: dict):
    """L'immagine sostituita o della figura eliminata non si cancella:
    va in grafiche/_archivio/."""
    if not g.get("immagine"):
        return
    f = gara / dl["cartella"] / g["immagine"]
    if f.is_file():
        archivio = f.parent / "_archivio"
        archivio.mkdir(parents=True, exist_ok=True)
        f.replace(archivio / f"{f.stem}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}{f.suffix}")


def elimina(gara: Path, dl: dict, gid: str):
    def fn(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "Aspetta che finisca l'operazione in corso su questa figura.")
        _archivia_immagine(gara, dl, g)
        _archivia_riferimento(gara, dl, g)
        archiviata = {**g, "eliminata_il": _ora()}
        dati.setdefault("eliminate", []).append(archiviata)
        dati["grafiche"] = [x for x in dati["grafiche"] if x["id"] != gid]
    _modifica(gara, dl, gid, fn)


def _salva_immagine(gara: Path, dl: dict, g: dict, dati_img: bytes, estensione: str, origine: str, modello: str | None):
    _archivia_immagine(gara, dl, g)
    rel = f"grafiche/{g['id']}{estensione}"
    f = gara / dl["cartella"] / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(dati_img)
    g.update(immagine=rel, origine=origine, modello=modello, immagine_il=_ora())


def _tipo_immagine(dati_img: bytes) -> str | None:
    if dati_img[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if dati_img[:3] == b"\xff\xd8\xff":
        return ".jpg"
    return None


def carica(gara: Path, dl: dict, gid: str, dati_img: bytes):
    if len(dati_img) > MAX_IMMAGINE:
        raise ErroreGrafica(413, "L'immagine supera 20 MB: riducila o esportala di nuovo da ChatGPT.")
    est = _tipo_immagine(dati_img)
    if est is None:
        raise ErroreGrafica(400, "Serve un'immagine PNG o JPG (il documento Word non accetta altri formati). "
                                 "Da ChatGPT scaricala come PNG.")

    def fn(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "Aspetta che finisca l'operazione in corso su questa figura.")
        _salva_immagine(gara, dl, g, dati_img, est, "caricata", None)
        g.pop("errore", None)
    _modifica(gara, dl, gid, fn)


# ── Riferimento ─────────────────────────────────────────────────────
def _archivia_riferimento(gara: Path, dl: dict, g: dict):
    rif = g.get("riferimento") or {}
    f = gara / dl["cartella"] / rif["immagine"] if rif.get("immagine") else None
    if f and f.is_file():
        archivio = f.parent / "_archivio"
        archivio.mkdir(parents=True, exist_ok=True)
        f.replace(archivio / f"{f.stem}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}{f.suffix}")


def _imposta_riferimento(gara: Path, dl: dict, g: dict, sorgente: Path, estensione: str, **campi):
    """Sposta l'immagine nel posto del riferimento della figura e registra i campi."""
    _archivia_riferimento(gara, dl, g)
    rel = f"grafiche/riferimenti/{g['id']}{estensione}"
    dest = gara / dl["cartella"] / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    sorgente.replace(dest)
    g["riferimento"] = {**campi, "immagine": rel, "impostato_il": _ora()}


def _tmp_riferimento(gara: Path, dl: dict, gid: str, estensione: str = ".png") -> Path:
    d = gara / dl["cartella"] / "grafiche" / "riferimenti"
    d.mkdir(parents=True, exist_ok=True)
    return d / f".{gid}-{threading.get_ident()}{estensione}"


def carica_riferimento(gara: Path, dl: dict, gid: str, dati_img: bytes):
    if len(dati_img) > MAX_IMMAGINE:
        raise ErroreGrafica(413, "L'immagine supera 20 MB: riducila prima di caricarla.")
    est = _tipo_immagine(dati_img)
    if est is None:
        raise ErroreGrafica(400, "Il riferimento deve essere un'immagine PNG o JPG.")
    tmp = _tmp_riferimento(gara, dl, gid, est)
    tmp.write_bytes(dati_img)

    def fn(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "Aspetta che finisca l'operazione in corso su questa figura.")
        _imposta_riferimento(gara, dl, g, tmp, est, origine="caricato",
                             cambiato_dopo_prompt=bool(g.get("prompt")))
        g["prompt_riferimento"] = ""  # quella scritta per il riferimento precedente non vale più
    try:
        _modifica(gara, dl, gid, fn)
    finally:
        tmp.unlink(missing_ok=True)


def ritaglia_riferimento(gara: Path, dl: dict, gid: str, riquadro: list[float]):
    g = next((x for x in registro.leggi(gara, dl["cartella"])["grafiche"] if x["id"] == gid), None)
    if g is None:
        raise ErroreGrafica(404, f"Figura {gid} non trovata.")
    rif = g.get("riferimento") or {}
    if rif.get("origine") != "elaborato":
        raise ErroreGrafica(409, "Si ritaglia solo un riferimento preso da un elaborato.")
    riquadro = riferimenti.normalizza_riquadro(riquadro)
    tmp = _tmp_riferimento(gara, dl, gid)
    try:
        riferimenti.ritaglia(riferimenti.risolvi(gara, rif["file"]), rif["pagina"], riquadro, tmp)
    except riferimenti.ErroreRiferimento as e:
        tmp.unlink(missing_ok=True)
        raise ErroreGrafica(422, str(e))

    def fn(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "Aspetta che finisca l'operazione in corso su questa figura.")
        precedente = g.get("riferimento") or {}
        # Stesso disegno, inquadrato meglio: il prompt resta valido.
        _imposta_riferimento(gara, dl, g, tmp, ".png", **{**precedente, "riquadro": riquadro})
    try:
        _modifica(gara, dl, gid, fn)
    finally:
        tmp.unlink(missing_ok=True)


def togli_riferimento(gara: Path, dl: dict, gid: str):
    def fn(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "Aspetta che finisca l'operazione in corso su questa figura.")
        rif = g.get("riferimento") or {}
        if rif.get("file"):
            # Non riproporlo alla prossima preparazione del prompt.
            g.setdefault("riferimenti_esclusi", []).append(f"{rif['file']}#{rif.get('pagina')}")
        _archivia_riferimento(gara, dl, g)
        g.pop("riferimento", None)
        g["prompt_riferimento"] = ""
    _modifica(gara, dl, gid, fn)


def file_riferimento(gara: Path, dl: dict, gid: str) -> Path | None:
    g = next((x for x in registro.leggi(gara, dl["cartella"])["grafiche"] if x["id"] == gid), None)
    return _file_riferimento(gara, dl, g) if g else None


def pagina_riferimento(gara: Path, dl: dict, gid: str) -> Path:
    g = next((x for x in registro.leggi(gara, dl["cartella"])["grafiche"] if x["id"] == gid), None)
    rif = (g or {}).get("riferimento") or {}
    if rif.get("origine") != "elaborato":
        raise ErroreGrafica(404, "Questa figura non ha un riferimento preso da un elaborato.")
    try:
        return riferimenti.anteprima_pagina(gara, riferimenti.risolvi(gara, rif["file"]), rif["pagina"])
    except riferimenti.ErroreRiferimento as e:
        raise ErroreGrafica(422, str(e))


def file_immagine(gara: Path, dl: dict, gid: str) -> Path | None:
    g = next((x for x in registro.leggi(gara, dl["cartella"])["grafiche"] if x["id"] == gid), None)
    if not g or not g.get("immagine"):
        return None
    f = gara / dl["cartella"] / g["immagine"]
    return f if f.is_file() else None


# ── Operazioni in background ────────────────────────────────────────
def _avvia(gara: Path, dl: dict, gid: str, tipo: str, verifica, lavoro):
    """Segna l'operazione nel registro e la esegue in un thread.
    verifica(g) solleva ErroreGrafica se non si può partire;
    lavoro(g) restituisce i campi da scrivere a operazione conclusa."""
    chiave = (str(gara), dl["cartella"], gid)

    def segna(dati, g):
        if _occupata(gara, dl, g):
            raise ErroreGrafica(409, "C'è già un'operazione in corso su questa figura.")
        verifica(g)
        g["operazione"] = {"tipo": tipo, "avviata_il": _ora()}
        g.pop("errore", None)
        return dict(g)
    with _lock:
        if chiave in _in_corso:
            raise ErroreGrafica(409, "C'è già un'operazione in corso su questa figura.")
        _in_corso.add(chiave)
    try:
        istantanea = _modifica(gara, dl, gid, segna)
    except Exception:
        _in_corso.discard(chiave)
        raise

    def esegui():
        try:
            esito, errore = lavoro(istantanea), None
        except immagini_openai.ErroreOpenAI as e:
            esito, errore = None, {"tipo": e.tipo, "operazione": tipo, "messaggio": str(e)}
        except Exception as e:  # noqa: BLE001 — l'errore va al professionista, non perso nel thread
            log.exception("Figura %s: %s non riuscita", gid, tipo)
            esito, errore = None, {"tipo": "altro", "operazione": tipo, "messaggio": str(e)[:600]}

        def chiudi(dati, g):
            g.pop("operazione", None)
            if errore:
                g["errore"] = errore
            elif callable(esito):
                esito(g)
            else:
                g.update(esito or {})
        try:
            _modifica(gara, dl, gid, chiudi)
        except ErroreGrafica:
            pass  # figura eliminata nel frattempo: niente da aggiornare
        finally:
            _in_corso.discard(chiave)

    threading.Thread(target=esegui, name=f"grafica-{gid}-{tipo}", daemon=True).start()


def _istruzioni_riferimento(gara: Path, dl: dict, g: dict, altro: bool) -> str:
    rif = g.get("riferimento") or {}
    if rif.get("origine") == "caricato" and _file_riferimento(gara, dl, g):
        rel = (gara / dl["cartella"] / rif["immagine"]).relative_to(gara)
        return f"""5. Riferimento visivo: il professionista ha già scelto l'immagine {rel}. Guardala con Read, NON cercarne
   altre e restituisci "riferimento": null. Scrivi "prompt_riferimento" per quell'immagine."""
    esclusi = list(g.get("riferimenti_esclusi") or [])
    if altro and rif.get("file"):
        esclusi.append(f"{rif['file']}#{rif.get('pagina')}")
    esclusi_txt = ("\n   Non riproporre queste pagine, già scartate dal professionista: "
                   + "; ".join(f"{e.split('#')[0]} pagina {e.split('#')[-1]}" for e in dict.fromkeys(esclusi))) if esclusi else ""
    return f"""5. Riferimento visivo: cerca negli elaborati un'immagine già esistente che mostri lo stesso oggetto o una
   vista vicina a quella richiesta (render o foto nelle relazioni, dettagli, sezioni o piante nelle tavole).
   Parti dagli elaborati citati nel nodo e dalle tavole collegate al criterio: nei nodi di 02_graph/nodes/ il
   campo `file:` dà il nome del PDF sotto input/. I PDF si guardano con Read (parametro pages, poche pagine
   per volta); quelli firmati .p7m si leggono dalla copia estratta in output/_cache/pdf/ (stesso nome senza
   .p7m). Guarda al massimo 8 pagine in tutto: è un aiuto, non una ricerca esaustiva.{esclusi_txt}
   Se ne trovi una davvero pertinente, restituisci "riferimento" con: "file" (il percorso del PDF che hai
   letto, relativo alla cartella della gara), "pagina" (da 1), "riquadro" [x0, y0, x1, y1] in frazioni della
   pagina (da 0 a 1, origine in alto a sinistra) che inquadra solo quel disegno o quell'immagine con un
   piccolo margine, e "motivo" (in italiano, una frase). Altrimenti "riferimento": null: meglio nessun
   riferimento che uno sbagliato.
   Con un riferimento, "prompt_riferimento" (in inglese, due o tre frasi) dice al modello d'immagine come usare
   l'immagine allegata: cosa tenere (geometria, impaginazione, proporzioni, punto di vista) e cosa cambiare
   secondo la proposta. Il "prompt" resta comunque autosufficiente, senza citare l'immagine allegata."""


def _prompt_per_claude(gara: Path, dl: dict, g: dict, altro: bool = False) -> str:
    p = _approvate(gara).get(g["proposta_id"], {"id": g["proposta_id"], "titolo": "", "sottocriterio": ""})
    nodo = next(iter(sorted((gara / "02_graph" / "proposals").glob(f"{p['id']}_*.md"))), None)
    nodo_rel = str(nodo.relative_to(gara)) if nodo else f"02_graph/proposals/{p['id']}_*.md"
    altre = [x for x in registro.leggi(gara, dl["cartella"])["grafiche"]
             if x["proposta_id"] == g["proposta_id"] and x["id"] != g["id"] and x.get("richiesta")]
    altre_txt = "\n".join(f"- {x['id']}: {x['richiesta']}" for x in altre) or "- nessuna"
    return f"""Prepari il prompt per un modello di generazione d'immagini (OpenAI) che deve produrre UNA figura
da inserire nella relazione tecnica di un'offerta per un appalto pubblico di lavori, letta da una
commissione giudicatrice di tecnici. Lavori in sola lettura: non modificare nessun file.

Proposta migliorativa approvata: {p['id']} «{p['titolo']}» (sottocriterio {p['sottocriterio']}).
Cosa deve mostrare la figura, secondo il professionista:
> {g['richiesta']}

Altre figure già previste per la stessa proposta (non duplicarle):
{altre_txt}

Cosa leggere, in quest'ordine e senza andare oltre il necessario:
1. il nodo della proposta: {nodo_rel} (testo, indicatori, evidenze, nota del professionista);
2. i gap collegati che il nodo cita (G-…): cercali in output/06_registers/gap_register.md;
3. gli elaborati citati nelle evidenze, nei nodi di 02_graph/nodes/ (cerca con Grep le voci, le tavole,
   le dimensioni e i materiali che servono alla figura);
4. vincoli_offerta_tecnica.md, solo per eventuali regole del disciplinare su immagini ed elaborati grafici.
{_istruzioni_riferimento(gara, dl, g, altro)}

Il prompt deve:
- essere in inglese e autosufficiente: il modello d'immagine non sa nulla del progetto;
- dire il tipo di grafica più adatto alla richiesta (schema tecnico, sezione, esploso assonometrico,
  dettaglio costruttivo, pianta schematica, infografica di processo, vista prospettica illustrativa);
- descrivere soggetto, componenti, materiali, finiture, dimensioni e rapporti reali presi dai documenti
  (scrivi i numeri), punto di vista, inquadratura e cosa deve risaltare rispetto alla soluzione di base;
- chiedere uno stile da documentazione tecnica sobria: sfondo bianco, linee pulite, palette contenuta,
  nessun effetto fotografico se la richiesta non lo chiede;
- se servono etichette nell'immagine, poche (al massimo 6), brevi, in italiano, scritte tra virgolette
  nel prompt esattamente come devono comparire;
- vietare: loghi, marchi e nomi commerciali di prodotti, persone riconoscibili, prezzi o importi,
  codici interni (P-…, G-…, E-…), testo lungo, cornici o cartigli;
- chiedere formato orizzontale 3:2.
Se un dato che servirebbe non è nei documenti, non inventarlo: lascia l'elemento generico.

La didascalia è in italiano, al massimo 25 parole, descrive cosa mostra la figura con il lessico del
disciplinare e non contiene codici interni né il numero della figura.

Rispondi SOLO con un oggetto JSON, senza altro testo prima o dopo:
{{"prompt": "...", "didascalia": "...", "note": "in italiano, una o due frasi: quali dati dei documenti hai usato e cosa hai lasciato generico",
  "riferimento": {{"file": "...", "pagina": 1, "riquadro": [0.1, 0.2, 0.5, 0.6], "motivo": "..."}} oppure null,
  "prompt_riferimento": "..." oppure ""}}
"""


def _estrai_json(testo: str) -> dict:
    inizio, fine = testo.find("{"), testo.rfind("}")
    if inizio < 0 or fine <= inizio:
        raise RuntimeError("Claude non ha restituito il prompt nel formato atteso. Riprova.")
    try:
        dati = json.loads(testo[inizio:fine + 1])
    except ValueError:
        raise RuntimeError("Claude non ha restituito il prompt nel formato atteso. Riprova.")
    if not str(dati.get("prompt") or "").strip():
        raise RuntimeError("Claude ha restituito un prompt vuoto. Riprova.")
    return dati


def _riferimento_da_claude(gara: Path, dl: dict, g: dict, d: dict):
    """Ritaglio del riferimento proposto da Claude, già validato: (file temporaneo, campi) o None."""
    r = d.get("riferimento")
    if not isinstance(r, dict) or not r.get("file"):
        return None
    try:
        rel = str(r["file"]).strip().lstrip("/")
        pdf = riferimenti.risolvi(gara, rel)
        pagina = int(r.get("pagina") or 1)
        riquadro = riferimenti.normalizza_riquadro(r.get("riquadro") or [0, 0, 1, 1])
        tmp = _tmp_riferimento(gara, dl, g["id"])
        riferimenti.ritaglia(pdf, pagina, riquadro, tmp)
    except (riferimenti.ErroreRiferimento, ValueError, TypeError) as e:
        log.warning("Figura %s: riferimento proposto non utilizzabile: %s", g["id"], e)
        return None
    # Il file si registra com'è negli elaborati (.p7m), non come copia in cache.
    originale = rel
    if rel.startswith(str(riferimenti.CACHE_PDF)):
        nome = Path(rel).name
        trovato = next((p for p in (gara / "input").rglob(nome + ".p7m")), None)
        originale = str(trovato.relative_to(gara)) if trovato else rel
    return tmp, {"origine": "elaborato", "file": originale, "pagina": pagina, "riquadro": riquadro,
                 "motivo": str(r.get("motivo") or "").strip()}


def prepara_prompt(gara: Path, dl: dict, gid: str, altro_riferimento: bool = False):
    env_claude = get_claude_env()  # solleva subito se Claude non è autenticato

    def verifica(g):
        if not (g.get("richiesta") or "").strip():
            raise ErroreGrafica(400, "Scrivi prima cosa deve mostrare la figura.")

    def lavoro(g):
        riferimenti.prepara_cache(gara)  # i .p7m diventano PDF leggibili da Claude (una volta sola)
        argv = ["bash", str(SPADA_CLAUDE), "-p", _prompt_per_claude(gara, dl, g, altro_riferimento),
                "--tools", TOOLS_CONSENTITI, "--disallowedTools", TOOLS_VIETATI]
        try:
            proc = subprocess.run(argv, cwd=str(gara), env={**os.environ, **env_claude},
                                  capture_output=True, text=True, timeout=TIMEOUT_PROMPT)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Claude non ha finito entro {TIMEOUT_PROMPT // 60} minuti. Riprova.")
        if proc.returncode != 0:
            raise RuntimeError(f"Claude non ha completato la preparazione (codice {proc.returncode}): "
                               f"{(proc.stderr or proc.stdout).strip()[-400:]}")
        d = _estrai_json(proc.stdout)
        campi = {"prompt": str(d["prompt"]).strip(), "didascalia": str(d.get("didascalia") or "").strip(),
                 "note_prompt": str(d.get("note") or "").strip(), "prompt_preparato_il": _ora(),
                 "prompt_riferimento": str(d.get("prompt_riferimento") or "").strip()}
        caricato = (g.get("riferimento") or {}).get("origine") == "caricato"
        trovato = None if caricato else _riferimento_da_claude(gara, dl, g, d)

        def applica(fig):
            fig.update(campi)
            if caricato:
                fig["riferimento"]["cambiato_dopo_prompt"] = False
            elif trovato:
                tmp, rif = trovato
                _imposta_riferimento(gara, dl, fig, tmp, ".png", **rif)
            else:
                # Nessun riferimento adatto: quello proposto in precedenza non vale più.
                _archivia_riferimento(gara, dl, fig)
                fig.pop("riferimento", None)
                fig["prompt_riferimento"] = ""
        return applica

    _avvia(gara, dl, gid, "prompt", verifica, lavoro)


def genera_immagine(gara: Path, dl: dict, gid: str):
    if not immagini_openai.stato()["configurata"]:
        raise ErroreGrafica(409, "Nessuna chiave OpenAI configurata: copia il prompt in ChatGPT e carica l'immagine, "
                                 "oppure inserisci la chiave nelle Impostazioni.")

    def verifica(g):
        if not (g.get("prompt") or "").strip():
            raise ErroreGrafica(400, "Prepara o scrivi prima il prompt.")

    def lavoro(g):
        rif = _file_riferimento(gara, dl, g) if g.get("usa_riferimento", True) else None
        dati_img, modello = immagini_openai.genera(prompt_effettivo(gara, dl, g), rif)
        est = _tipo_immagine(dati_img) or ".png"
        return lambda fig: _salva_immagine(gara, dl, fig, dati_img, est, "openai", modello)

    _avvia(gara, dl, gid, "immagine", verifica, lavoro)
