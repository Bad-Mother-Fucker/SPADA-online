"""Schede tecniche della relazione tecnica (Fase 7).

Come per le figure, SPADA propone e il professionista sceglie:

1. proposta: Claude, in sola lettura sul workspace della gara, legge le
   proposte approvate ed elenca i prodotti e i componenti che potrebbero
   dover presentare un documento del produttore (scheda tecnica, EPD,
   dichiarazione di prestazione, certificato, rapporto di prova);
2. scelta: il professionista include solo quelle che vuole allegare (e
   può aggiungerne a mano). SOLO le incluse entrano nella relazione;
3. file: il PDF si carica, se il professionista lo ha, oppure si cerca
   online. Claude cerca sul sito del produttore il prodotto indicato o,
   se manca, propone due o tre prodotti conformi alla proposta; il
   professionista sceglie e SPADA scarica il PDF ufficiale.

Proposta e ricerca girano in un thread del backend, come la
preparazione dei prompt delle figure (vedi grafiche.py): se il backend
si riavvia a metà, l'operazione risulta interrotta e si riprova.

Il registro è in schede_offerta.py (_pipeline), condiviso con chi scrive
la relazione e con l'esportazione.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from auth import get_claude_env
from paths import SPADA_CLAUDE

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_pipeline" / "scripts" / "setup"))
import deliverables_offerta as offerta  # noqa: E402
import schede_offerta as registro  # noqa: E402

log = logging.getLogger("spada.schede")

TIMEOUT_PROPONI = 10 * 60
TIMEOUT_CERCA = 10 * 60
TIMEOUT_DOWNLOAD = 90
MAX_PDF = 30 * 1024 * 1024
TOOLS_LETTURA = "Read,Grep,Glob"
TOOLS_RICERCA = "Read,Grep,Glob,WebSearch,WebFetch"
TOOLS_VIETATI = "Write,Edit,Bash,Task,Agent,NotebookEdit"
OPERAZIONE_ELENCO = "_elenco"  # chiave dell'operazione «proponi», che riguarda tutto il registro
# Nel PDF di un produttore un prezzo violerebbe il divieto di elementi economici nella busta tecnica.
RE_PREZZI = re.compile(r"€|\bEUR\b|\bprezz[oi]\b|\blistino\b|\bprice\b|\bIVA esclusa\b", re.I)

_lock = threading.Lock()
_in_corso: set[tuple[str, str, str]] = set()  # (cartella gara, cartella deliverable, id scheda | _elenco)


class ErroreScheda(Exception):
    def __init__(self, codice: int, messaggio: str):
        super().__init__(messaggio)
        self.codice = codice


# ── Lettura ─────────────────────────────────────────────────────────
def _approvate(gara: Path) -> dict[str, dict]:
    return {p["id"]: {**p, "criterio": p["id"].split("-")[1]} for p in offerta.proposte_decise(gara)["approvate"]}


def _citate(gara: Path, dl: dict) -> dict[str, list[str] | None]:
    """Schede citate nella bozza e nel definitivo (None se il file non c'è)."""
    out = {}
    for sid, _, nome in offerta.stadi_di(dl["tipo"]):
        if sid in ("bozza", "definitivo") and nome:
            f = gara / dl["cartella"] / nome
            out[sid] = registro.segnaposti(f.read_text(encoding="utf-8")) if f.is_file() else None
    return out


def _operazione_viva(gara: Path, dl: dict, chiave_id: str, op: dict | None, errore: dict | None):
    if op and (str(gara), dl["cartella"], chiave_id) not in _in_corso:
        # Thread sparito: il backend è stato riavviato durante l'operazione.
        return None, {"tipo": "interrotta", "operazione": op["tipo"],
                      "messaggio": "Operazione interrotta da un riavvio di SPADA: riprova."}
    return op, errore


def _vista(gara: Path, dl: dict, s: dict, approvate: dict, citate: dict) -> dict:
    op, errore = _operazione_viva(gara, dl, s["id"], s.get("operazione"), s.get("errore"))
    f = gara / dl["cartella"] / s["file"] if s.get("file") else None
    return {
        "id": s["id"], "proposta_id": s["proposta_id"], "proposta_approvata": s["proposta_id"] in approvate,
        "oggetto": s.get("oggetto", ""), "tipo": s.get("tipo", "scheda_tecnica"), "documenta": s.get("documenta", ""),
        "origine": s.get("origine", "spada"), "inclusa": bool(s.get("inclusa")),
        "produttore": s.get("produttore", ""), "modello": s.get("modello", ""),
        "file": ({"nome": Path(s["file"]).name, "fonte": s.get("fonte"), "caricato_il": s.get("file_il"),
                  "pagine": s.get("pagine"), "avvisi": s.get("avvisi_file", [])}
                 if f is not None and f.is_file() else None),
        "candidati": s.get("candidati", []), "note_ricerca": s.get("note_ricerca", ""),
        "operazione": op, "errore": errore,
        "citata": {sid: (None if ids is None else s["id"] in ids) for sid, ids in citate.items()},
    }


def elenco(gara: Path, dl: dict) -> dict:
    approvate = _approvate(gara)
    citate = _citate(gara, dl)
    dati = registro.leggi(gara, dl["cartella"])
    op, errore = _operazione_viva(gara, dl, OPERAZIONE_ELENCO, dati.get("operazione"), dati.get("errore"))
    return {
        "proposte": list(approvate.values()),
        "schede": [_vista(gara, dl, s, approvate, citate) for s in dati["schede"]],
        "tipi": registro.TIPI,
        "consegna": dati["consegna"], "consegne": registro.CONSEGNE,
        "proposta_il": dati.get("proposta_il"), "operazione": op, "errore": errore,
        "testi": {sid: ids is not None for sid, ids in citate.items()},
        "consegnati": _consegnati(gara, dl, dati["consegna"]),
    }


def _consegnati(gara: Path, dl: dict, consegna: str) -> list[str]:
    """File prodotti dall'ultima esportazione per la consegna scelta (ZIP o
    PDF sciolti), come percorsi sotto output/ per lo scaricamento."""
    cartella = gara / dl["cartella"]
    if consegna == "zip":
        trovati = sorted(cartella.glob("Allegati_*.zip"))
    elif consegna == "file":
        trovati = sorted((cartella / "allegati").glob("*.pdf"))
    else:
        return []
    return [str(f.relative_to(gara / "output")) for f in trovati]


# ── Modifiche al registro ───────────────────────────────────────────
def _modifica(gara: Path, dl: dict, sid: str | None, fn):
    """Legge, applica fn(dati, scheda) e scrive, sotto lock."""
    with _lock:
        dati = registro.leggi(gara, dl["cartella"])
        s = None
        if sid is not None:
            s = next((x for x in dati["schede"] if x["id"] == sid), None)
            if s is None:
                raise ErroreScheda(404, f"Scheda {sid} non trovata.")
        esito = fn(dati, s)
        registro.scrivi(gara, dl["cartella"], dati)
        return esito


def _occupata(gara: Path, dl: dict, s: dict) -> bool:
    return bool(s.get("operazione")) and (str(gara), dl["cartella"], s["id"]) in _in_corso


def _nuova(dati: dict, proposta_id: str, oggetto: str, tipo: str, documenta: str, origine: str, inclusa: bool) -> dict:
    sid = f"sch-{dati['prossimo']:02d}"
    dati["prossimo"] += 1
    s = {"id": sid, "proposta_id": proposta_id, "oggetto": oggetto.strip(),
         "tipo": tipo if tipo in registro.TIPI else "scheda_tecnica", "documenta": documenta.strip(),
         "origine": origine, "inclusa": inclusa, "produttore": "", "modello": "", "creata_il": registro.ora()}
    dati["schede"].append(s)
    return s


def crea(gara: Path, dl: dict, proposta_id: str, oggetto: str, tipo: str, documenta: str) -> str:
    """Voce aggiunta a mano dal professionista: inclusa per definizione."""
    if proposta_id not in _approvate(gara):
        raise ErroreScheda(409, "Le schede si aggiungono solo alle proposte approvate.")
    return _modifica(gara, dl, None, lambda dati, _: _nuova(dati, proposta_id, oggetto, tipo, documenta,
                                                            "professionista", True)["id"])


def aggiorna(gara: Path, dl: dict, sid: str, campi: dict):
    def fn(dati, s):
        if _occupata(gara, dl, s):
            raise ErroreScheda(409, "Aspetta che finisca la ricerca in corso su questa scheda.")
        for k in ("oggetto", "documenta", "produttore", "modello"):
            if campi.get(k) is not None:
                s[k] = campi[k].strip()
        if campi.get("tipo") in registro.TIPI:
            s["tipo"] = campi["tipo"]
        if campi.get("inclusa") is not None:
            s["inclusa"] = bool(campi["inclusa"])
        s["aggiornata_il"] = registro.ora()
    _modifica(gara, dl, sid, fn)


def imposta_consegna(gara: Path, dl: dict, consegna: str):
    if consegna not in registro.CONSEGNE:
        raise ErroreScheda(400, f"Modalità di consegna non valida: {consegna}.")
    _modifica(gara, dl, None, lambda dati, _: dati.update(consegna=consegna))


def _archivia_file(gara: Path, dl: dict, s: dict):
    """Il PDF sostituito o della scheda eliminata non si cancella: va in schede/_archivio/."""
    if not s.get("file"):
        return
    f = gara / dl["cartella"] / s["file"]
    if f.is_file():
        archivio = f.parent / "_archivio"
        archivio.mkdir(parents=True, exist_ok=True)
        f.replace(archivio / f"{f.stem}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}{f.suffix}")
    for k in ("file", "fonte", "file_il", "pagine", "avvisi_file"):
        s.pop(k, None)


def elimina(gara: Path, dl: dict, sid: str):
    def fn(dati, s):
        if _occupata(gara, dl, s):
            raise ErroreScheda(409, "Aspetta che finisca la ricerca in corso su questa scheda.")
        _archivia_file(gara, dl, s)
        dati.setdefault("eliminate", []).append({**s, "eliminata_il": registro.ora()})
        dati["schede"] = [x for x in dati["schede"] if x["id"] != sid]
    _modifica(gara, dl, sid, fn)


# ── File PDF ────────────────────────────────────────────────────────
def _analizza_pdf(f: Path) -> tuple[int | None, list[str]]:
    """Pagine e avvisi: un PDF con prezzi non può stare nella busta tecnica."""
    pagine, avvisi = None, []
    try:
        info = subprocess.run(["pdfinfo", str(f)], capture_output=True, text=True, timeout=60).stdout
        if (m := re.search(r"^Pages:\s+(\d+)", info, re.M)):
            pagine = int(m.group(1))
        testo = subprocess.run(["pdftotext", "-l", "60", str(f), "-"], capture_output=True, text=True, timeout=120).stdout
    except (OSError, subprocess.SubprocessError):
        return pagine, ["Non è stato possibile leggere il testo del PDF: controlla a mano che non riporti prezzi."]
    trovati = sorted({m.group(0).strip().lower(): m.group(0).strip() for m in RE_PREZZI.finditer(testo)}.values(),
                     key=str.lower)
    if trovati:
        avvisi.append(f"Il PDF contiene {', '.join('«' + t + '»' for t in trovati[:5])}: controlla che non riporti "
                      "prezzi o listini, vietati nella busta tecnica (pena l'esclusione).")
    if not testo.strip():
        avvisi.append("Il PDF non ha testo leggibile (scansione): controllalo a vista.")
    return pagine, avvisi


def _salva_pdf(gara: Path, dl: dict, s: dict, dati_pdf: bytes, fonte: dict):
    _archivia_file(gara, dl, s)
    rel = f"schede/{s['id']}.pdf"
    f = gara / dl["cartella"] / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(dati_pdf)
    pagine, avvisi = _analizza_pdf(f)
    s.update(file=rel, fonte=fonte, file_il=registro.ora(), pagine=pagine, avvisi_file=avvisi)


def _controlla_pdf(dati_pdf: bytes):
    if len(dati_pdf) > MAX_PDF:
        raise ErroreScheda(413, "Il PDF supera 30 MB.")
    if not dati_pdf.startswith(b"%PDF"):
        raise ErroreScheda(400, "Serve un file PDF.")


def carica(gara: Path, dl: dict, sid: str, dati_pdf: bytes, nome: str):
    _controlla_pdf(dati_pdf)

    def fn(dati, s):
        if _occupata(gara, dl, s):
            raise ErroreScheda(409, "Aspetta che finisca la ricerca in corso su questa scheda.")
        _salva_pdf(gara, dl, s, dati_pdf, {"tipo": "caricata", "nome_originale": nome})
        s["inclusa"] = True
        s.pop("errore", None)
    _modifica(gara, dl, sid, fn)


def _scarica(url: str) -> bytes:
    if urlparse(url).scheme not in ("http", "https"):
        raise ErroreScheda(400, "L'indirizzo della scheda non è un link web.")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SPADA; schede tecniche)",
                                               "Accept": "application/pdf,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_DOWNLOAD) as r:
            dati_pdf = r.read(MAX_PDF + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ErroreScheda(502, f"Download non riuscito ({getattr(e, 'reason', e)}). Apri il link, scarica il PDF "
                                "dal sito del produttore e caricalo qui.")
    if not dati_pdf.startswith(b"%PDF"):
        raise ErroreScheda(502, "Il link non porta direttamente a un PDF (il sito chiede un clic o un accesso). "
                                "Apri il link, scarica il PDF e caricalo qui.")
    _controlla_pdf(dati_pdf)
    return dati_pdf


def usa_candidato(gara: Path, dl: dict, sid: str, indice: int):
    """Scarica il PDF del candidato scelto dal professionista."""
    s = next((x for x in registro.leggi(gara, dl["cartella"])["schede"] if x["id"] == sid), None)
    if s is None:
        raise ErroreScheda(404, f"Scheda {sid} non trovata.")
    candidati = s.get("candidati") or []
    if not 0 <= indice < len(candidati):
        raise ErroreScheda(404, "Prodotto proposto non trovato: rifai la ricerca.")
    c = candidati[indice]
    dati_pdf = _scarica(c.get("url_pdf") or "")

    def fn(dati, s):
        if _occupata(gara, dl, s):
            raise ErroreScheda(409, "Aspetta che finisca la ricerca in corso su questa scheda.")
        _salva_pdf(gara, dl, s, dati_pdf, {"tipo": "online", "url": c.get("url_pdf"), "pagina": c.get("url_pagina"),
                                           "scaricata_il": registro.ora()})
        s["produttore"], s["modello"] = c.get("produttore", ""), c.get("modello", "")
        s["inclusa"] = True
        s.pop("errore", None)
    _modifica(gara, dl, sid, fn)


def file_pdf(gara: Path, dl: dict, sid: str) -> Path | None:
    s = next((x for x in registro.leggi(gara, dl["cartella"])["schede"] if x["id"] == sid), None)
    if not s or not s.get("file"):
        return None
    f = gara / dl["cartella"] / s["file"]
    return f if f.is_file() else None


# ── Operazioni con Claude, in background ────────────────────────────
def _claude(gara: Path, prompt: str, tools: str, timeout: int) -> dict:
    env_claude = get_claude_env()
    # --tools li rende disponibili, --allowedTools li autorizza: in modalità
    # non interattiva WebSearch e WebFetch altrimenti vengono negati.
    argv = ["bash", str(SPADA_CLAUDE), "-p", prompt, "--tools", tools, "--allowedTools", tools,
            "--disallowedTools", TOOLS_VIETATI]
    try:
        proc = subprocess.run(argv, cwd=str(gara), env={**os.environ, **env_claude},
                              capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Claude non ha finito entro {timeout // 60} minuti. Riprova.")
    if proc.returncode != 0:
        raise RuntimeError(f"Claude non ha completato l'operazione (codice {proc.returncode}): "
                           f"{(proc.stderr or proc.stdout).strip()[-400:]}")
    testo = proc.stdout
    inizio, fine = testo.find("{"), testo.rfind("}")
    try:
        return json.loads(testo[inizio:fine + 1]) if 0 <= inizio < fine else {}
    except ValueError:
        return {}


def _avvia(gara: Path, dl: dict, chiave_id: str, tipo: str, segna, lavoro, chiudi):
    """Segna l'operazione nel registro (segna), esegue lavoro() in un thread
    e scrive l'esito con chiudi(dati, esito, errore)."""
    chiave = (str(gara), dl["cartella"], chiave_id)
    get_claude_env()  # solleva subito se Claude non è autenticato
    with _lock:
        if chiave in _in_corso:
            raise ErroreScheda(409, "C'è già un'operazione in corso.")
        _in_corso.add(chiave)
    try:
        istantanea = _modifica(gara, dl, None if chiave_id == OPERAZIONE_ELENCO else chiave_id, segna)
    except Exception:
        _in_corso.discard(chiave)
        raise

    def esegui():
        try:
            esito, errore = lavoro(istantanea), None
        except Exception as e:  # noqa: BLE001 — l'errore va al professionista, non perso nel thread
            log.exception("Schede: %s non riuscita", tipo)
            esito, errore = None, {"tipo": "altro", "operazione": tipo, "messaggio": str(e)[:600]}
        try:
            _modifica(gara, dl, None, lambda dati, _: chiudi(dati, esito, errore))
        finally:
            _in_corso.discard(chiave)

    threading.Thread(target=esegui, name=f"schede-{chiave_id}-{tipo}", daemon=True).start()


def _nodi(gara: Path, ids: list[str]) -> str:
    righe = []
    for pid in ids:
        nodo = next(iter(sorted((gara / "02_graph" / "proposals").glob(f"{pid}_*.md"))), None)
        righe.append(f"- {pid}: {nodo.relative_to(gara) if nodo else '(nodo non trovato)'}")
    return "\n".join(righe)


def _prompt_proponi(gara: Path, dl: dict, approvate: dict, esistenti: list[dict]) -> str:
    gia = "\n".join(f"- {s['proposta_id']}: {registro.TIPI.get(s.get('tipo'), '')} — {s.get('oggetto', '')}"
                    for s in esistenti) or "- nessuna"
    testo = next((dl["cartella"] + "/" + n for sid, _, n in reversed(offerta.stadi_di(dl["tipo"]))
                  if n and (gara / dl["cartella"] / n).is_file()), None)
    return f"""Prepari l'elenco dei documenti di prodotto che potrebbero essere allegati alla relazione tecnica di
un'offerta per un appalto pubblico di lavori: per ogni proposta migliorativa approvata, i prodotti e i
componenti per cui il produttore rilascia un documento che comprova quanto dichiarato. Il professionista
sceglierà quali allegare. Lavori in sola lettura: non modificare nessun file.

Proposte approvate (nodi da leggere):
{_nodi(gara, list(approvate))}
{f"Testo attuale della relazione, per vedere quali valori di prodotto vengono dichiarati: {testo}" if testo else ""}
Per ogni proposta leggi il nodo (testo, indicatori, evidenze); vincoli_offerta_tecnica.md solo per le regole
del disciplinare su schede tecniche e certificazioni.

Per ogni prodotto o componente la cui miglioria si fonda su prestazioni o caratteristiche dichiarate
(classe, efficienza, conducibilità, contenuto di riciclato, durabilità, potenza, garanzia…) indica il
documento più adatto a comprovarle:
- scheda_tecnica: caratteristiche e prestazioni del prodotto;
- epd: dichiarazione ambientale di prodotto (contenuto di riciclato, CAM, impatto);
- dop: dichiarazione di prestazione (prodotti da costruzione marcati CE);
- certificato: certificazioni di terza parte (Eurovent, FSC/PEFC, Ecolabel, classe di reazione al fuoco…);
- rapporto_prova: prove di laboratorio (sollevamento al vento, gelo-disgelo, antiscivolo…).
Una voce per documento; niente voci per lavorazioni, servizi, render, campioni, schemi o calcoli: non hanno
un documento del produttore. Niente marche: il prodotto lo sceglie poi il professionista.

Voci già nell'elenco (non ripeterle):
{gia}

Rispondi SOLO con un oggetto JSON, senza altro testo prima o dopo:
{{"schede": [{{"proposta_id": "P-C1-001", "oggetto": "pannello HPL compatto delle pareti divisorie",
"tipo": "scheda_tecnica", "documenta": "in italiano, una frase: quali valori della proposta comprova"}}]}}
"""


def proponi(gara: Path, dl: dict):
    approvate = _approvate(gara)
    if not approvate:
        raise ErroreScheda(409, "Non ci sono proposte approvate: le schede si propongono per quelle.")

    def segna(dati, _):
        dati["operazione"] = {"tipo": "proponi", "avviata_il": registro.ora()}
        dati.pop("errore", None)
        return [dict(s) for s in dati["schede"]]

    def lavoro(esistenti):
        d = _claude(gara, _prompt_proponi(gara, dl, approvate, esistenti), TOOLS_LETTURA, TIMEOUT_PROPONI)
        voci = d.get("schede")
        if not isinstance(voci, list):
            raise RuntimeError("Claude non ha restituito l'elenco nel formato atteso. Riprova.")
        return voci

    def chiudi(dati, voci, errore):
        dati.pop("operazione", None)
        if errore:
            dati["errore"] = errore
            return
        presenti = {(s["proposta_id"], s.get("tipo"), s.get("oggetto", "").lower()) for s in dati["schede"]}
        for v in voci:
            pid, oggetto = str(v.get("proposta_id", "")), str(v.get("oggetto", "")).strip()
            tipo = v.get("tipo") if v.get("tipo") in registro.TIPI else "scheda_tecnica"
            if pid in approvate and oggetto and (pid, tipo, oggetto.lower()) not in presenti:
                _nuova(dati, pid, oggetto, tipo, str(v.get("documenta", "")), "spada", False)
        dati["proposta_il"] = registro.ora()

    _avvia(gara, dl, OPERAZIONE_ELENCO, "proponi", segna, lavoro, chiudi)


def _prompt_cerca(gara: Path, s: dict) -> str:
    tipo = registro.TIPI.get(s.get("tipo"), "Scheda tecnica")
    if registro.prodotto(s):
        compito = (f"Il professionista ha indicato il prodotto: {registro.prodotto(s)}. Trova il documento richiesto "
                   "di QUESTO prodotto; restituisci un solo candidato (o più, solo se esistono varianti del modello "
                   "fra cui scegliere).")
    else:
        compito = ("Il professionista non ha indicato un prodotto: proponi da 2 a 3 prodotti di produttori diversi, "
                   "reperibili in Italia, che rispettano i valori della proposta, ciascuno con il suo documento.")
    return f"""Cerchi online il documento ufficiale del produttore da allegare alla relazione tecnica di un'offerta
per un appalto pubblico di lavori. Non modificare nessun file.

Documento: {tipo} — {s.get('oggetto', '')}
Cosa deve comprovare: {s.get('documenta') or '(non indicato: deducilo dalla proposta)'}
Proposta: leggi il nodo {_nodi(gara, [s['proposta_id']]).split(': ', 1)[1]} per i valori e le prestazioni dichiarati.

{compito}

Regole:
- usa WebSearch e WebFetch; il PDF deve venire dal sito ufficiale del produttore (o da un registro
  ufficiale, per EPD e certificati: EPD Italy, EPD International, Eurovent, FSC/PEFC…), mai da rivenditori,
  marketplace o siti con prezzi;
- url_pdf è il link DIRETTO al file PDF (che si scarica senza clic né accesso); se il produttore lo
  pubblica solo dietro un modulo, lascia url_pdf vuoto e metti in url_pagina la pagina da cui scaricarlo;
- preferisci il documento in italiano e l'edizione più recente;
- verifica con WebFetch sulla pagina o sul PDF che il prodotto rispetti i valori della proposta e scrivilo;
  se un valore non è rispettato o non è dichiarato, dillo;
- non inventare link: se non trovi niente di affidabile, restituisci un elenco vuoto e spiega perché.

Rispondi SOLO con un oggetto JSON, senza altro testo prima o dopo:
{{"candidati": [{{"produttore": "...", "modello": "...", "url_pdf": "https://…pdf", "url_pagina": "https://…",
"verifica": "in italiano, una o due frasi: valori della proposta rispettati o no, con i numeri del documento"}}],
"note": "in italiano, una frase: come hai cercato e cosa manca"}}
"""


def cerca(gara: Path, dl: dict, sid: str):
    def segna(dati, s):
        if _occupata(gara, dl, s):
            raise ErroreScheda(409, "C'è già una ricerca in corso su questa scheda.")
        s["operazione"] = {"tipo": "cerca", "avviata_il": registro.ora()}
        s.pop("errore", None)
        return dict(s)

    def lavoro(s):
        d = _claude(gara, _prompt_cerca(gara, s), TOOLS_RICERCA, TIMEOUT_CERCA)
        if not isinstance(d.get("candidati"), list):
            raise RuntimeError("Claude non ha restituito i risultati nel formato atteso. Riprova.")
        candidati = [{k: str(c.get(k) or "").strip() for k in ("produttore", "modello", "url_pdf", "url_pagina", "verifica")}
                     for c in d["candidati"] if isinstance(c, dict)]
        return {"candidati": candidati, "note_ricerca": str(d.get("note") or "").strip()}

    def chiudi(dati, esito, errore):
        s = next((x for x in dati["schede"] if x["id"] == sid), None)
        if s is None:
            return  # scheda eliminata nel frattempo
        s.pop("operazione", None)
        if errore:
            s["errore"] = errore
        else:
            s.update(esito, cercata_il=registro.ora())

    _avvia(gara, dl, sid, "cerca", segna, lavoro, chiudi)
