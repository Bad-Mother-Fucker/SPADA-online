#!/usr/bin/env python3
"""Fase 6 — le decisioni del professionista sulle proposte, dal database
dell'app ai file della gara, prima che feedback-processor le elabori.

Il professionista decide dall'interfaccia (tabella `approvazioni`, una
riga per ogni clic: vale l'ultima per proposta). Qui le decisioni si
scrivono parola per parola nei campi **Decisione:** e **Note:** delle
schede in output/05_criteria_outputs/Cx_output.md, che è ciò che
feedback-processor legge: il modello non deve ricostruirle.

Uso (cwd qualsiasi):
  decisioni_proposte.py scrivi <gara_dir> <db_path>
      Scrive le decisioni, il registro output/06_registers/
      decisioni_professionista.md e stampa, una per riga, i criteri da
      elaborare con feedback-processor. Un criterio già elaborato torna
      da elaborare se una sua decisione è cambiata; un criterio senza
      proposte si chiude subito. Esce con 2 se manca una decisione
      sulle proposte del registro o una nota su un «da modificare».
  decisioni_proposte.py memoria <gara_dir> <db_path>
      Aggiunge (o sostituisce) in _state/memoria.md il paragrafo della
      Fase 6 con le decisioni, a elaborazione conclusa.
"""
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

PAROLA = {"approvata": "Approva", "da_modificare": "Approva con modifiche", "scartata": "Scarta"}
ETICHETTA = {"approvata": "approvata", "da_modificare": "approvata con modifiche", "scartata": "scartata"}
ID_RE = re.compile(r"^#### (P-C\d+-\d+)\b")
RIGA_REGISTRO_RE = re.compile(r"^\|\s*(P-C\d+-\d+)\s*\|")
TITOLO_MEMORIA = "## Fase 6 — Revisione delle proposte"


def decisioni(gara: Path, db: str) -> dict:
    """Ultima decisione per proposta: {id: {decisione, nota, quando}}."""
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    righe = con.execute(
        "SELECT riferimento, decisione, nota, creato_il FROM approvazioni "
        "WHERE gara_slug=? AND fase=6 AND tipo='proposta' AND riferimento IS NOT NULL ORDER BY id",
        (gara.name,)).fetchall()
    con.close()
    ultime = {}
    for r in righe:
        if r["decisione"]:
            ultime[r["riferimento"]] = {"decisione": r["decisione"], "nota": (r["nota"] or "").strip(),
                                        "quando": r["creato_il"]}
    return ultime


def proposte_registro(gara: Path) -> list:
    p = gara / "output" / "06_registers" / "proposal_register.md"
    if not p.is_file():
        return []
    return [m.group(1) for riga in p.read_text(encoding="utf-8").splitlines()
            if (m := RIGA_REGISTRO_RE.match(riga))]


def mancanti(gara: Path, dec: dict) -> list:
    """Motivi per cui la revisione non si può confermare (vuoto = ok)."""
    motivi = [f"{i}: nessuna decisione" for i in proposte_registro(gara) if i not in dec]
    motivi += [f"{i}: «da modificare» senza nota che dica cosa cambiare"
               for i, d in dec.items() if d["decisione"] == "da_modificare" and not d["nota"]]
    return motivi


def _stato_feedback(testo: str) -> str:
    m = re.search(r"^stato_feedback:\s*(\S+)", testo, re.M)
    return m.group(1) if m else ""


def _con_stato_feedback(testo: str, stato: str) -> str:
    return re.sub(r"^stato_feedback:.*$", f"stato_feedback: {stato}", testo, count=1, flags=re.M)


def scrivi_file(f: Path, dec: dict) -> tuple:
    """Riscrive Decisione/Note di ogni scheda proposta di un Cx_output.md.
    Restituisce (proposte nel file, cambiato rispetto a prima)."""
    righe = f.read_text(encoding="utf-8").split("\n")
    corrente, ids, cambiato = None, [], False
    for i, riga in enumerate(righe):
        m = ID_RE.match(riga)
        if m:
            corrente = m.group(1)
            ids.append(corrente)
            continue
        if riga.startswith("### ") or riga.startswith("## "):
            corrente = None
            continue
        if corrente is None:
            continue
        d = dec.get(corrente)
        if riga.startswith("**Decisione:**"):
            nuova = f"**Decisione:** {PAROLA[d['decisione']]}" if d else "**Decisione:**"
        elif riga.startswith("**Note:**"):
            nota = " ".join(d["nota"].split()) if d and d["nota"] else ""
            nuova = f"**Note:** {nota}".rstrip() if nota else "**Note:**"
        else:
            continue
        if riga.rstrip() != nuova:
            righe[i] = nuova
            cambiato = True
    if cambiato:
        f.write_text("\n".join(righe), encoding="utf-8")
    return ids, cambiato


def registro(gara: Path, dec: dict, per_criterio: dict):
    p = gara / "output" / "06_registers" / "decisioni_professionista.md"
    oggi = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    righe = [
        "# Decisioni del professionista sulle proposte (Fase 6)", "",
        f"Scritto da `decisioni_proposte.py` il {oggi} dalle decisioni prese nell'interfaccia: "
        "riportate parola per parola, non rielaborate. Le stesse decisioni sono nei campi "
        "**Decisione** e **Note** delle schede in `output/05_criteria_outputs/Cx_output.md`.", "",
        "| Proposta | Criterio | Decisione | Nota del professionista | Data |", "|---|---|---|---|---|",
    ]
    for criterio, ids in per_criterio.items():
        for i in ids:
            d = dec.get(i)
            if d:
                nota = " ".join(d["nota"].split()).replace("|", "/") or "—"
                righe.append(f"| {i} | {criterio} | {ETICHETTA[d['decisione']]} | {nota} | {d['quando'][:10]} |")
            else:
                righe.append(f"| {i} | {criterio} | senza decisione (non nel registro delle proposte) | — | — |")
    p.write_text("\n".join(righe) + "\n", encoding="utf-8")


def cmd_scrivi(gara: Path, db: str) -> int:
    dec = decisioni(gara, db)
    motivi = mancanti(gara, dec)
    if motivi:
        print("Revisione incompleta:", "; ".join(motivi[:8]) + ("…" if len(motivi) > 8 else ""), file=sys.stderr)
        return 2
    per_criterio, da_elaborare = {}, []
    for f in sorted((gara / "output" / "05_criteria_outputs").glob("C*_output.md")):
        criterio = f.name.split("_")[0]
        ids, cambiato = scrivi_file(f, dec)
        per_criterio[criterio] = ids
        testo = f.read_text(encoding="utf-8")
        stato = _stato_feedback(testo)
        if not ids:
            # Nessuna proposta (es. criterio tabellare): niente da elaborare.
            if stato != "completato":
                f.write_text(_con_stato_feedback(testo, "completato"), encoding="utf-8")
            continue
        if stato == "completato" and cambiato:
            f.write_text(_con_stato_feedback(testo, "in_attesa"), encoding="utf-8")
            stato = "in_attesa"
        if stato != "completato":
            da_elaborare.append(criterio)
    registro(gara, dec, per_criterio)
    print("\n".join(da_elaborare))
    return 0


def cmd_memoria(gara: Path, db: str) -> int:
    dec = decisioni(gara, db)
    conta = {k: sum(1 for d in dec.values() if d["decisione"] == k) for k in PAROLA}
    oggi = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    paragrafo = (
        f"{TITOLO_MEMORIA} ({oggi})\n\n"
        f"Decisioni del professionista dall'interfaccia: {conta['approvata']} approvate, "
        f"{conta['da_modificare']} approvate con modifiche, {conta['scartata']} scartate. "
        "Scritte nei campi Decisione/Note di `output/05_criteria_outputs/Cx_output.md` ed elaborate "
        "da feedback-processor: nodi in `02_graph/proposals/`, registri e brief aggiornati. "
        "Registro completo: `output/06_registers/decisioni_professionista.md`. "
        "Le proposte con modifiche vanno redatte applicando la nota del professionista.\n"
    )
    p = gara / "_state" / "memoria.md"
    testo = p.read_text(encoding="utf-8") if p.is_file() else ""
    inizio = testo.find(TITOLO_MEMORIA)
    if inizio >= 0:
        fine = testo.find("\n## ", inizio + 1)
        testo = testo[:inizio] + paragrafo + (testo[fine + 1:] if fine >= 0 else "")
    else:
        testo = testo.rstrip("\n") + "\n\n" + paragrafo
    p.write_text(testo, encoding="utf-8")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("scrivi", "memoria"):
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    comando, gara, db = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    sys.exit(cmd_scrivi(gara, db) if comando == "scrivi" else cmd_memoria(gara, db))
