#!/usr/bin/env python3
"""domande.py — registro unico delle domande al professionista.

Tutte le domande della gara stanno in un solo file,
`output/07_questions/domande.json` (schema in
`_pipeline/schemas/domande.schema.json`), e si rispondono in un solo
posto: la Fase 4 «Domande al professionista». Le scrivono gli agenti
delle fasi 1-3 e delle integrazioni (sempre con questo script, mai a
mano sul JSON), le risponde il professionista dall'interfaccia, e
l'esecuzione della Fase 4 le «invia»: solo allora le risposte entrano
nel contesto della gara (memoria, grafo, brief).

Due usi:
- libreria per il backend (`carica`, `salva_bozza`, `aggiungi_informazione`,
  `elimina`, `mancanti_per_invio`, ...);
- riga di comando per agenti e script della pipeline, con la gara come
  directory corrente:

    domande.py aggiungi --origine fase_2 --categoria quesito_sa \\
        --testo "..." [--perche "..."] [--fonte "..."] [--criterio C2]
    domande.py supera D-003 --motivo "risolta dagli elaborati: ..." [--da D-009]
    domande.py elenco [--aperte] [--json]
    domande.py consolida --run <run_id>      # Fase 4, prima dell'agente
    domande.py segna-inviate --run <run_id>  # Fase 4, a esito positivo
    domande.py handoff <file handoff>        # Fase 4, decisioni a valle
    domande.py importa-brief                 # migrazione: domande del vecchio brief

Ogni modifica riscrive anche `output/07_questions/domande.md`, la
versione leggibile da condividere.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ORIGINI = ("fase_1", "fase_2", "fase_3", "integrazione", "professionista")
CATEGORIE = ("amministrativa", "quesito_sa", "tecnica", "strategica", "informazione")
ETICHETTA_CATEGORIA = {
    "amministrativa": "Amministrativa",
    "quesito_sa": "Quesito alla stazione appaltante",
    "tecnica": "Tecnica",
    "strategica": "Strategica",
    "informazione": "Informazione del professionista",
}
ETICHETTA_ORIGINE = {
    "fase_1": "Fase 1 · disciplinare",
    "fase_2": "Fase 2 · elaborati",
    "fase_3": "Fase 3 · analisi strategica",
    "integrazione": "Integrazione di un documento",
    "professionista": "Professionista",
}
TONI = ("conservativo", "bilanciato", "audace")
LIVELLI = ("ALTA", "MEDIA", "BASSA")
PREFISSO_HANDOFF = "[Professionista]"
TITOLO_MEMORIA = "## Risposte e indicazioni del professionista (Fase 4)"


def ora() -> str:
    return datetime.now(timezone.utc).isoformat()


def percorso(gara_dir: Path) -> Path:
    return Path(gara_dir) / "output" / "07_questions" / "domande.json"


def _vuoto() -> dict:
    return {
        "versione": 1,
        "domande": [],
        "indicazioni": {"tono": "", "priorita": [], "vincoli": [], "opportunita": [], "note": "",
                        "aggiornate_il": None, "inviate_il": None},
        "invii": [],
    }


def carica(gara_dir: Path) -> dict:
    p = percorso(gara_dir)
    if not p.exists():
        return _vuoto()
    try:
        dati = json.loads(p.read_text(encoding="utf-8"))
    except ValueError as e:
        raise ValueError(f"{p} non è JSON valido: {e}") from e
    base = _vuoto()
    for k, v in base.items():
        dati.setdefault(k, v)
    for k, v in base["indicazioni"].items():
        dati["indicazioni"].setdefault(k, v)
    return dati


def _scrivi_atomico(p: Path, testo: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=f".{p.name}.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(testo.rstrip("\n") + "\n")
    os.replace(tmp, p)


def salva(gara_dir: Path, dati: dict):
    _scrivi_atomico(percorso(gara_dir), json.dumps(dati, ensure_ascii=False, indent=2))
    _scrivi_atomico(percorso(gara_dir).with_suffix(".md"), rendi_markdown(gara_dir, dati))


def _chiave(testo: str) -> str:
    t = re.sub(r"[*_`\[\]>#]", "", testo or "").lower()
    return " ".join(t.split())


def _prossimo_id(dati: dict) -> str:
    n = max((int(d["id"].split("-")[1]) for d in dati["domande"] if re.match(r"^D-\d+$", d.get("id", ""))), default=0)
    return f"D-{n + 1:03d}"


def criteri(gara_dir: Path) -> list[dict]:
    """Criteri attivi dalle pagine criterio: servono alle priorità."""
    out = []
    cartella = Path(gara_dir) / "output" / "03_criteria" / "criteria"
    if not cartella.exists():
        return out
    for f in sorted(cartella.glob("criterion_C*.md"), key=lambda p: int(re.sub(r"\D", "", p.stem) or 0)):
        cid = f.stem.replace("criterion_", "")
        testo = f.read_text(encoding="utf-8")
        m = re.search(r"^(?:title|titolo):\s*(.+)$", testo, re.MULTILINE)
        titolo = m.group(1).strip().strip('"') if m else ""
        out.append({"id": cid, "etichetta": f"{cid} — {titolo}" if titolo else cid})
    return out


# ── Scrittura da parte della pipeline ────────────────────────────────

def aggiungi(gara_dir: Path, origine: str, categoria: str, testo: str,
             perche: str = "", fonte: str = "", criterio: str | None = None,
             risposta: str = "") -> tuple[str, bool]:
    """(id, creata). Una domanda già presente e non superata con lo
    stesso testo non si duplica: si ritorna il suo id."""
    if origine not in ORIGINI:
        raise ValueError(f"origine non valida: {origine!r} (ammesse: {', '.join(ORIGINI)})")
    if categoria not in CATEGORIE:
        raise ValueError(f"categoria non valida: {categoria!r} (ammesse: {', '.join(CATEGORIE)})")
    testo = " ".join((testo or "").split())
    if not testo:
        raise ValueError("testo della domanda vuoto")
    if criterio and not re.match(r"^C\d+(\.\d+)?$", criterio):
        raise ValueError(f"criterio non valido: {criterio!r} (es. C2 o C2.1)")
    dati = carica(gara_dir)
    for d in dati["domande"]:
        if d.get("stato") != "superata" and _chiave(d["testo"]) == _chiave(testo):
            return d["id"], False
    nuova = {
        "id": _prossimo_id(dati), "origine": origine, "categoria": categoria,
        "criterio": criterio or None, "testo": testo,
        "perche": " ".join((perche or "").split()), "fonte": " ".join((fonte or "").split()),
        "stato": "aperta", "superata_da": None, "motivo_superata": "",
        "creata_il": ora(), "risposta": risposta.strip(),
        "risposta_il": ora() if risposta.strip() else None, "inviata_il": None,
    }
    dati["domande"].append(nuova)
    salva(gara_dir, dati)
    return nuova["id"], True


def supera(gara_dir: Path, id_domanda: str, motivo: str, da: str | None = None):
    """Una domanda a cui le fasi successive hanno già dato risposta (es.
    gli elaborati chiariscono un dubbio del disciplinare) o sostituita da
    una più precisa. Non si cancella: resta nello storico, e una risposta
    già data resta leggibile."""
    dati = carica(gara_dir)
    d = next((x for x in dati["domande"] if x["id"] == id_domanda), None)
    if d is None:
        raise ValueError(f"domanda {id_domanda} non trovata")
    if da and not any(x["id"] == da for x in dati["domande"]):
        raise ValueError(f"domanda sostitutiva {da} non trovata")
    d["stato"] = "superata"
    d["superata_da"] = da
    d["motivo_superata"] = " ".join((motivo or "").split())
    salva(gara_dir, dati)


# ── Scrittura da parte dell'interfaccia (bozza) ──────────────────────

class DatiNonValidi(ValueError):
    pass


def salva_bozza(gara_dir: Path, risposte: dict[str, str] | None, indicazioni: dict | None) -> dict:
    """Salva risposte e indicazioni SENZA inviarle: nessun effetto su
    memoria, grafo o brief finché la Fase 4 non viene eseguita."""
    dati = carica(gara_dir)
    per_id = {d["id"]: d for d in dati["domande"]}
    for id_domanda, testo in (risposte or {}).items():
        d = per_id.get(id_domanda)
        if d is None:
            raise DatiNonValidi(f"domanda {id_domanda} non trovata")
        nuova = (testo or "").strip()
        if nuova != (d.get("risposta") or ""):
            d["risposta"] = nuova
            d["risposta_il"] = ora() if nuova else None
    if indicazioni is not None:
        ind = dati["indicazioni"]
        tono = (indicazioni.get("tono") or "").strip().lower()
        if tono and tono not in TONI:
            raise DatiNonValidi(f"tono non valido: {tono!r}")
        ids = [c["id"] for c in criteri(gara_dir)]
        per_crit = {p.get("id"): p for p in (indicazioni.get("priorita") or []) if isinstance(p, dict)}
        priorita = []
        for cid in ids or list(per_crit):
            p = per_crit.get(cid, {})
            livello = (p.get("livello") or "").strip().upper()
            if livello and livello not in LIVELLI:
                raise DatiNonValidi(f"priorità non valida per {cid}: {livello!r}")
            priorita.append({"id": cid, "livello": livello, "indicazione": str(p.get("indicazione") or "").strip()})
        pulisci = lambda xs: [str(x).strip() for x in (xs or []) if str(x).strip()]
        nuove = {"tono": tono, "priorita": priorita,
                 "vincoli": pulisci(indicazioni.get("vincoli")),
                 "opportunita": pulisci(indicazioni.get("opportunita")),
                 "note": str(indicazioni.get("note") or "").strip()}
        # La data cambia solo se cambiano i valori: è ciò che dice se le
        # indicazioni vanno inviate di nuovo.
        if any(ind.get(k) != v for k, v in nuove.items()):
            ind.update(nuove, aggiornate_il=ora())
    salva(gara_dir, dati)
    return dati


def aggiungi_informazione(gara_dir: Path, titolo: str, testo: str, criterio: str | None = None) -> str:
    """Un'informazione che il professionista vuole far entrare nel
    contesto senza che nessuno gliel'abbia chiesta: si tratta come una
    domanda già risposta, e viaggia con il prossimo invio."""
    if not (titolo or "").strip() or not (testo or "").strip():
        raise DatiNonValidi("titolo e testo dell'informazione sono obbligatori")
    id_, _ = aggiungi(gara_dir, "professionista", "informazione", titolo, criterio=criterio, risposta=testo)
    return id_


def elimina(gara_dir: Path, id_domanda: str):
    """Solo le informazioni aggiunte dal professionista, e solo se non
    ancora inviate: le domande della pipeline si superano, non si
    cancellano."""
    dati = carica(gara_dir)
    d = next((x for x in dati["domande"] if x["id"] == id_domanda), None)
    if d is None:
        raise DatiNonValidi(f"{id_domanda} non trovata")
    if d["origine"] != "professionista":
        raise DatiNonValidi("si possono eliminare solo le informazioni aggiunte dal professionista")
    if d.get("inviata_il"):
        raise DatiNonValidi("informazione già inviata con la Fase 4: è entrata nel contesto della gara")
    dati["domande"] = [x for x in dati["domande"] if x["id"] != id_domanda]
    salva(gara_dir, dati)


def da_inviare(dati: dict) -> list[dict]:
    """Risposte nuove o cambiate dall'ultimo invio."""
    out = []
    for d in dati["domande"]:
        if not (d.get("risposta") or "").strip():
            continue
        if not d.get("inviata_il") or (d.get("risposta_il") or "") > d["inviata_il"]:
            out.append(d)
    return out


def mancanti_per_invio(gara_dir: Path, dati: dict | None = None) -> list[str]:
    """Cosa serve per eseguire la Fase 4: il tono e una priorità (livello
    o indicazione) per ogni criterio. Le domande senza risposta non
    bloccano: restano aperte e si dichiarano come tali."""
    dati = dati or carica(gara_dir)
    ind = dati["indicazioni"]
    m = []
    if not ind.get("tono"):
        m.append("tono generale")
    per_crit = {p["id"]: p for p in ind.get("priorita", [])}
    for c in criteri(gara_dir):
        p = per_crit.get(c["id"], {})
        if not p.get("livello") and not p.get("indicazione"):
            m.append(f"priorità di {c['id']}")
    return m


# ── Fase 4: consolidamento e invio ───────────────────────────────────

def _riga(s: str) -> str:
    return " ".join((s or "").split())


def _indicazioni_md(gara_dir: Path, ind: dict) -> list[str]:
    etichette = {c["id"]: c["etichetta"] for c in criteri(gara_dir)}
    righe = ["## Indicazioni strategiche del professionista", "",
             f"**Tono generale:** {ind.get('tono') or '[non indicato]'}", "",
             "**Priorita' per criterio:**"]
    for p in ind.get("priorita", []):
        valore = (f"**{p['livello']}**" if p.get("livello") else "")
        if p.get("indicazione"):
            valore += (" — " if valore else "") + _riga(p["indicazione"])
        righe.append(f"- {etichette.get(p['id'], p['id'])}: {valore or '[non indicata]'}")
    for titolo, chiave, vuoto in (("Vincoli specifici", "vincoli", "Nessuno"),
                                  ("Opportunita' da valorizzare", "opportunita", "Nessuna")):
        righe += ["", f"**{titolo}:**"]
        righe += [f"- {_riga(v)}" for v in ind.get(chiave, [])] or [f"- {vuoto}"]
    righe += ["", "**Note aggiuntive:**", ind.get("note", "").strip() or "Nessuna", ""]
    return righe


def consolida(gara_dir: Path, run_id: str) -> Path:
    """Prima dell'agente della Fase 4: scrive il digest
    `output/07_questions/risposte_professionista.md` (quello che le fasi
    successive leggono al posto della vecchia sezione dell'audit) e il
    paragrafo della memoria di gara. Deterministico: niente di quello che
    il professionista ha scritto passa per un riassunto del modello."""
    gara_dir = Path(gara_dir)
    dati = carica(gara_dir)
    manifest = {}
    try:
        manifest = json.loads((gara_dir / "manifest.json").read_text(encoding="utf-8"))
    except Exception:
        pass
    nome = manifest.get("nome") or gara_dir.name
    oggi = datetime.now().strftime("%d/%m/%Y")
    attive = [d for d in dati["domande"] if d.get("stato") != "superata"]
    risposte = [d for d in attive if (d.get("risposta") or "").strip() and d["categoria"] != "informazione"]
    info = [d for d in attive if d["categoria"] == "informazione" and (d.get("risposta") or "").strip()]
    senza = [d for d in attive if not (d.get("risposta") or "").strip()]
    nuove = {d["id"] for d in da_inviare(dati)}

    righe = [f"# Risposte e indicazioni del professionista — {nome}", "",
             f"> Inviate il {oggi} con la Fase 4 (run `{run_id}`). Fonte: `output/07_questions/domande.json`.",
             f"> {len(risposte)} risposte, {len(info)} informazioni aggiunte, {len(senza)} domande senza risposta."
             f" Nuove o cambiate rispetto all'invio precedente: {', '.join(sorted(nuove)) or 'nessuna'}.", ""]
    righe += _indicazioni_md(gara_dir, dati["indicazioni"])
    righe += ["## Risposte alle domande", ""]
    for d in risposte:
        crit = f" · {d['criterio']}" if d.get("criterio") else ""
        righe += [f"### {d['id']} · {ETICHETTA_CATEGORIA[d['categoria']]}{crit}" + (" · nuova" if d["id"] in nuove else ""),
                  "", f"**Domanda:** {_riga(d['testo'])}"]
        if d.get("fonte"):
            righe.append(f"**Fonte della domanda:** {_riga(d['fonte'])}")
        righe += ["", f"**Risposta:** {d['risposta'].strip()}", ""]
    if not risposte:
        righe += ["Nessuna risposta.", ""]
    righe += ["## Informazioni aggiunte dal professionista", ""]
    for d in info:
        crit = f" · {d['criterio']}" if d.get("criterio") else ""
        righe += [f"### {d['id']} · {_riga(d['testo'])}{crit}" + (" · nuova" if d["id"] in nuove else ""),
                  "", d["risposta"].strip(), ""]
    if not info:
        righe += ["Nessuna.", ""]
    righe += ["## Domande rimaste senza risposta", ""]
    righe += [f"- {d['id']} ({ETICHETTA_CATEGORIA[d['categoria']]}): {_riga(d['testo'])}" for d in senza] or ["Nessuna."]
    out = gara_dir / "output" / "07_questions" / "risposte_professionista.md"
    _scrivi_atomico(out, "\n".join(righe))

    # Memoria: un solo paragrafo, sostituito a ogni invio.
    m_path = gara_dir / "_state" / "memoria.md"
    memoria = m_path.read_text(encoding="utf-8") if m_path.exists() else ""
    memoria = re.sub(rf"\n{re.escape(TITOLO_MEMORIA)}.*?(?=\n## |\Z)", "", memoria, flags=re.DOTALL)
    ind = dati["indicazioni"]
    par = [f"\n{TITOLO_MEMORIA}\n",
           f"Inviate il {oggi}. Testo integrale: `output/07_questions/risposte_professionista.md`.\n",
           f"- Tono generale: {ind.get('tono') or 'non indicato'}"]
    for p in ind.get("priorita", []):
        par.append(f"- Priorità {p['id']}: {p.get('livello') or '—'}" + (f" — {_riga(p['indicazione'])}" if p.get("indicazione") else ""))
    par += [f"- Vincolo: {_riga(v)}" for v in ind.get("vincoli", [])]
    par += [f"- Opportunità: {_riga(v)}" for v in ind.get("opportunita", [])]
    if ind.get("note"):
        par.append(f"- Note: {_riga(ind['note'])}")
    par += [f"- {d['id']} D: {_riga(d['testo'])} — R: {_riga(d['risposta'])}" for d in risposte]
    par += [f"- {d['id']} informazione «{_riga(d['testo'])}»: {_riga(d['risposta'])}" for d in info]
    if senza:
        par.append(f"- Senza risposta: {', '.join(d['id'] for d in senza)}")
    memoria = memoria.rstrip("\n") + "\n" + "\n".join(par) + "\n"
    _scrivi_atomico(m_path, memoria)
    return out


def segna_inviate(gara_dir: Path, run_id: str):
    dati = carica(gara_dir)
    adesso = ora()
    inviate = da_inviare(dati)
    for d in inviate:
        d["inviata_il"] = adesso
    dati["indicazioni"]["inviate_il"] = adesso
    dati["invii"].append({"inviato_il": adesso, "run_id": run_id, "domande": [d["id"] for d in inviate]})
    salva(gara_dir, dati)


def scrivi_handoff(gara_dir: Path, h_path: Path):
    """Le indicazioni e le risposte come `decisioni` dell'handoff della
    Fase 4, che la Fase 5 riceve nel prompt. Idempotente."""
    dati = carica(gara_dir)
    try:
        handoff = json.loads(Path(h_path).read_text(encoding="utf-8"))
    except Exception:
        handoff = {"fase": 4, "generato_il": ora(), "entita_chiave": [], "riferimenti": []}
    ind = dati["indicazioni"]
    linee = [f"Tono generale: {ind.get('tono') or 'non indicato'}"]
    linee += [f"Priorità {p['id']}: {p.get('livello') or '—'}" + (f" — {_riga(p['indicazione'])}" if p.get("indicazione") else "")
              for p in ind.get("priorita", [])]
    linee += [f"Vincolo: {_riga(v)}" for v in ind.get("vincoli", [])]
    linee += [f"Opportunità: {_riga(v)}" for v in ind.get("opportunita", [])]
    linee += [f"{d['id']}: {_riga(d['risposta'])}" for d in dati["domande"]
              if d.get("stato") != "superata" and (d.get("risposta") or "").strip()]
    handoff["decisioni"] = [x for x in handoff.get("decisioni", []) if not str(x).startswith(PREFISSO_HANDOFF)]
    handoff["decisioni"] += [f"{PREFISSO_HANDOFF} {x}" for x in linee]
    rif = {"percorso_o_nodo": "output/07_questions/risposte_professionista.md",
           "descrizione": "risposte e indicazioni del professionista inviate con la Fase 4"}
    if not any(r.get("percorso_o_nodo") == rif["percorso_o_nodo"] for r in handoff.get("riferimenti", [])):
        handoff.setdefault("riferimenti", []).append(rif)
    _scrivi_atomico(Path(h_path), json.dumps(handoff, ensure_ascii=False, indent=2))


# ── Vista leggibile ──────────────────────────────────────────────────

def rendi_markdown(gara_dir: Path, dati: dict) -> str:
    righe = ["# Domande al professionista", "",
             "> Registro unico delle domande della gara (Fase 4). Generato da "
             "`domande.py` a ogni modifica: non modificarlo a mano, la fonte è `domande.json`.", ""]
    for cat in CATEGORIE:
        voci = [d for d in dati["domande"] if d["categoria"] == cat]
        if not voci:
            continue
        righe += [f"## {ETICHETTA_CATEGORIA[cat]}", ""]
        for d in voci:
            stato = " — *superata*" if d.get("stato") == "superata" else ""
            crit = f" · {d['criterio']}" if d.get("criterio") else ""
            righe.append(f"**{d['id']}**{crit} · {ETICHETTA_ORIGINE.get(d['origine'], d['origine'])}{stato}")
            righe.append("")
            righe.append(_riga(d["testo"]))
            if d.get("perche"):
                righe += ["", f"*Perché:* {_riga(d['perche'])}"]
            if d.get("fonte"):
                righe += ["", f"*Fonte:* {_riga(d['fonte'])}"]
            if d.get("stato") == "superata" and d.get("motivo_superata"):
                righe += ["", f"*Superata:* {_riga(d['motivo_superata'])}" + (f" (vedi {d['superata_da']})" if d.get("superata_da") else "")]
            r = (d.get("risposta") or "").strip()
            righe += ["", f"**Risposta:** {r}" if r else "**Risposta:** —", ""]
    if not dati["domande"]:
        righe += ["Nessuna domanda registrata.", ""]
    return "\n".join(righe)


def importa_brief(gara_dir: Path) -> int:
    """Migrazione: le «Domande aperte per il professionista» di un gara
    brief scritto con il template precedente diventano voci del registro
    (origine fase_1), con le eventuali risposte già date. Idempotente."""
    p = Path(gara_dir) / "output" / "03_criteria" / "gara_brief.md"
    if not p.exists():
        return 0
    testo = p.read_text(encoding="utf-8")
    m = re.search(r"^## Domande aperte[^\n]*\n(.*?)(?=^## |\Z)", testo, re.MULTILINE | re.DOTALL)
    if not m:
        return 0
    voci, corrente = [], None
    for r in m.group(1).split("\n"):
        mi = re.match(r"^(\d+)[.)]\s+(.*)$", r)
        if mi:
            corrente = {"testo": mi.group(2), "risposta": ""}
            voci.append(corrente)
        elif corrente is not None:
            mr = re.match(r"^\s*\*\*Risposta:?\*\*:?\s*(.*)$", r)
            if mr:
                corrente["risposta"] = mr.group(1).strip()
            elif r.startswith((" ", "\t")) and r.strip() and corrente["risposta"]:
                corrente["risposta"] += "\n" + r.strip()
            elif r.strip() and not r.startswith((">", "-", "<")):
                corrente["testo"] += " " + r.strip()
    nuove = 0
    for v in voci:
        t = v["testo"]
        cat = "quesito_sa" if re.search(r"quesit|chiariment|stazione appaltante|\bSA\b", t, re.I) else "amministrativa"
        crit = re.search(r"\bC(\d+(?:\.\d+)?)\b", t)
        _, creata = aggiungi(gara_dir, "fase_1", cat, t, fonte="gara brief (Fase 1, template precedente)",
                             criterio=f"C{crit.group(1)}" if crit else None, risposta=v["risposta"])
        nuove += int(creata)
    return nuove


# ── Riga di comando ──────────────────────────────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description="Registro delle domande al professionista (cwd = radice della gara).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("aggiungi")
    a.add_argument("--origine", required=True, choices=ORIGINI)
    a.add_argument("--categoria", required=True, choices=CATEGORIE)
    a.add_argument("--testo", required=True)
    a.add_argument("--perche", default="")
    a.add_argument("--fonte", default="")
    a.add_argument("--criterio")
    s = sub.add_parser("supera")
    s.add_argument("id")
    s.add_argument("--motivo", required=True)
    s.add_argument("--da")
    e = sub.add_parser("elenco")
    e.add_argument("--aperte", action="store_true")
    e.add_argument("--json", action="store_true")
    c = sub.add_parser("consolida")
    c.add_argument("--run", required=True)
    i = sub.add_parser("segna-inviate")
    i.add_argument("--run", required=True)
    h = sub.add_parser("handoff")
    h.add_argument("file")
    sub.add_parser("importa-brief")
    sub.add_parser("rendi")
    args = ap.parse_args(argv)
    gara = Path.cwd()
    if not (gara / "manifest.json").exists():
        print("✗ Lancia domande.py dalla radice della gara (manifest.json non trovato).", file=sys.stderr)
        return 2
    try:
        if args.cmd == "aggiungi":
            id_, creata = aggiungi(gara, args.origine, args.categoria, args.testo, args.perche, args.fonte, args.criterio)
            print(f"{id_} {'aggiunta' if creata else 'già presente'}")
        elif args.cmd == "supera":
            supera(gara, args.id, args.motivo, args.da)
            print(f"{args.id} superata")
        elif args.cmd == "elenco":
            dati = carica(gara)
            voci = [d for d in dati["domande"] if not args.aperte or d.get("stato") != "superata"]
            if args.json:
                print(json.dumps(voci, ensure_ascii=False, indent=2))
            else:
                for d in voci:
                    stato = "superata" if d.get("stato") == "superata" else ("risposta" if (d.get("risposta") or "").strip() else "aperta")
                    print(f"{d['id']} [{d['categoria']}{' ' + d['criterio'] if d.get('criterio') else ''}] ({stato}) {d['testo']}")
                if not voci:
                    print("(nessuna domanda)")
        elif args.cmd == "consolida":
            print(consolida(gara, args.run))
        elif args.cmd == "segna-inviate":
            segna_inviate(gara, args.run)
        elif args.cmd == "handoff":
            scrivi_handoff(gara, Path(args.file))
        elif args.cmd == "importa-brief":
            print(f"{importa_brief(gara)} domande importate dal brief")
        elif args.cmd == "rendi":
            salva(gara, carica(gara))
    except ValueError as ex:
        print(f"✗ {ex}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
