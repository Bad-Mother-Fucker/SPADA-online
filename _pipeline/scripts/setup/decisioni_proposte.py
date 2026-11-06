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
  decisioni_proposte.py vincoli <gara_dir> <db_path>
      Compila la Sezione B di vincoli_offerta_tecnica.md (criteri inclusi,
      budget facciate, priorità, note strategiche) da punteggi del
      disciplinare, indicazioni della Fase 4 e proposte approvate. Non
      tocca una Sezione B scritta a mano.

Le proposte del professionista (aggiunte in Fase 6) stanno in
output/06_registers/proposte_professionista.json: `scrivi` le inserisce
come schede approvate nel Cx_output.md del loro criterio, così
feedback-processor le tratta come le altre.
"""
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

PAROLA = {"approvata": "Approva", "da_modificare": "Approva con modifiche", "scartata": "Scarta"}
ETICHETTA = {"approvata": "approvata", "da_modificare": "approvata con modifiche", "scartata": "scartata"}
ID_RE = re.compile(r"^#### (P-C\d+-\d+)\b")
RIGA_REGISTRO_RE = re.compile(r"^\|\s*(P-C\d+-\d+)\s*\|")
SOTTO_RE = re.compile(r"^### Sottocriterio (C\d+\.\d+)")
TITOLO_MEMORIA = "## Fase 6 — Revisione delle proposte"
TITOLO_PROPRIE = "### Proposte del professionista"
NOTA_PROPRIA = ("Proposta del professionista, inserita in Fase 6: va redatta come scritta. "
                "Non ha evidenze raccolte dal sistema.")
MARCA_SEZIONE_B = "<!-- sezione-b: compilata da decisioni_proposte.py -->"


# ── Proposte del professionista ─────────────────────────────────────
def _file_proprie(gara: Path) -> Path:
    return gara / "output" / "06_registers" / "proposte_professionista.json"


def proposte_proprie(gara: Path) -> list:
    f = _file_proprie(gara)
    if not f.is_file():
        return []
    try:
        return json.loads(f.read_text(encoding="utf-8")).get("proposte", [])
    except (ValueError, AttributeError):
        return []


def _salva_proprie(gara: Path, proposte: list):
    f = _file_proprie(gara)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps({"versione": 1, "proposte": proposte}, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    tmp.replace(f)


def elaborata(gara: Path, pid: str) -> bool:
    """La proposta è già un nodo del grafo (feedback-processor l'ha creata)."""
    d = gara / "02_graph" / "proposals"
    return d.is_dir() and any(d.glob(f"{pid}_*.md"))


def prossimo_id(gara: Path, criterio: str) -> str:
    """Primo P-Cx-NNN libero: si contano gli id citati ovunque nella gara
    (schede, registri, nodi, proposte «da integrare»), non solo nel
    registro, per non riusare un numero che compare già da qualche parte."""
    rx = re.compile(rf"\bP-{re.escape(criterio)}-(\d+)\b")
    massimo = 0
    for radice in (gara / "output", gara / "02_graph"):
        if not radice.is_dir():
            continue
        for f in radice.rglob("*"):
            if f.suffix in (".md", ".json") and f.is_file():
                try:
                    testo = f.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                massimo = max([massimo, *(int(n) for n in rx.findall(testo))])
    return f"P-{criterio}-{massimo + 1:03d}"


def aggiungi_propria(gara: Path, criterio: str, sottocriterio: str | None, gap_id: str | None,
                     titolo: str, descrizione: str) -> dict:
    voce = {
        "id": prossimo_id(gara, criterio), "criterio": criterio,
        "sottocriterio": sottocriterio or None, "gap_id": gap_id or None,
        "titolo": " ".join(titolo.split()), "descrizione": descrizione.strip(),
        "creato_il": datetime.now(timezone.utc).isoformat(),
    }
    _salva_proprie(gara, proposte_proprie(gara) + [voce])
    return voce


def elimina_propria(gara: Path, pid: str) -> bool:
    """Toglie una proposta non ancora diventata nodo. False se non c'è."""
    proposte = proposte_proprie(gara)
    resto = [p for p in proposte if p["id"] != pid]
    if len(resto) == len(proposte):
        return False
    _salva_proprie(gara, resto)
    return True


def _scheda_propria(p: dict) -> list:
    gap = f"- [{p['gap_id']}](#{p['gap_id']})" if p.get("gap_id") else "- nessuno indicato dal professionista"
    righe = [f"#### {p['id']} — {p['titolo']}", "", "**Origine:** professionista", ""]
    if p.get("sottocriterio"):
        righe += [f"**Sottocriterio:** {p['sottocriterio']}", ""]
    righe += ["**Gap collegati:**", gap, "", "**La proposta.**", *p["descrizione"].splitlines(), "",
              "**Audit:** non auditata — proposta inserita dal professionista in Fase 6, approvata da lui stesso.", "",
              "**Decisione:** Approva", f"**Note:** {NOTA_PROPRIA}", ""]
    return righe


def _blocco(righe: list, inizio: int) -> int:
    """Indice della riga dopo la scheda che comincia a `inizio`."""
    for j in range(inizio + 1, len(righe)):
        if righe[j].startswith(("#### ", "### ", "## ")):
            return j
    return len(righe)


def _fine_sottosezione(righe: list, k: int) -> int:
    for j in range(k + 1, len(righe)):
        if righe[j].startswith(("### ", "## ")):
            return j
    return len(righe)


def allinea_proprie(f: Path, proprie: list) -> bool:
    """Inserisce in fondo alla sezione «4. Proposte» le schede delle
    proposte del professionista che mancano, e toglie quelle che il
    professionista ha eliminato. True se il file è cambiato."""
    righe = f.read_text(encoding="utf-8").split("\n")
    volute = {p["id"]: p for p in proprie}
    presenti, cambiato = set(), False
    i = 0
    while i < len(righe):
        m = ID_RE.match(righe[i])
        if not m:
            i += 1
            continue
        fine = _blocco(righe, i)
        if any(r.strip() == "**Origine:** professionista" for r in righe[i:fine]):
            if m.group(1) not in volute:
                del righe[i:fine]
                cambiato = True
                continue
            presenti.add(m.group(1))
        i = fine
    mancanti = [p for pid, p in volute.items() if pid not in presenti]
    if mancanti:
        if TITOLO_PROPRIE not in righe:
            # Fine della sezione 4: prima delle ipotesi scartate o della sezione 5.
            inizio4 = next((k for k, r in enumerate(righe) if re.match(r"^## 4\.", r)), None)
            if inizio4 is None:
                return cambiato
            punto = next((k for k in range(inizio4 + 1, len(righe))
                          if righe[k].startswith("## ") or righe[k].startswith("### Ipotesi")), len(righe))
            righe[punto:punto] = [TITOLO_PROPRIE, ""]
        punto = _fine_sottosezione(righe, righe.index(TITOLO_PROPRIE))
        righe[punto:punto] = [r for p in mancanti for r in _scheda_propria(p)]
        cambiato = True
    if TITOLO_PROPRIE in righe:
        k = righe.index(TITOLO_PROPRIE)
        fine = _fine_sottosezione(righe, k)
        if not any(ID_RE.match(r) for r in righe[k + 1:fine]):
            del righe[k:fine]
            cambiato = True
    if cambiato:
        f.write_text("\n".join(righe), encoding="utf-8")
    return cambiato


def decisioni(gara: Path, db: str) -> dict:
    """Ultima decisione per proposta: {id: {decisione, nota, quando}}.
    Le proposte del professionista sono approvate per definizione."""
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
    for p in proposte_proprie(gara):
        ultime[p["id"]] = {"decisione": "approvata", "nota": NOTA_PROPRIA, "quando": p["creato_il"]}
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
    proprie = proposte_proprie(gara)
    for f in sorted((gara / "output" / "05_criteria_outputs").glob("C*_output.md")):
        criterio = f.name.split("_")[0]
        aggiunte = allinea_proprie(f, [p for p in proprie if p["criterio"] == criterio])
        ids, cambiato = scrivi_file(f, dec)
        cambiato = cambiato or aggiunte
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


# ── Sezione B di vincoli_offerta_tecnica.md ─────────────────────────
def _approvate_per_sottocriterio(gara: Path, dec: dict) -> dict:
    """{sottocriterio: [(id, titolo, con_modifiche)]} delle proposte
    approvate, letto dalle schede (il sottocriterio è l'intestazione
    «### Sottocriterio Cx.y» sopra la scheda, o il campo della scheda)."""
    out = {}
    for f in sorted((gara / "output" / "05_criteria_outputs").glob("C*_output.md")):
        criterio, sotto = f.name.split("_")[0], None
        righe = f.read_text(encoding="utf-8").split("\n")
        for i, riga in enumerate(righe):
            if (m := SOTTO_RE.match(riga)):
                sotto = m.group(1)
                continue
            if riga.startswith("### ") or riga.startswith("## "):
                sotto = None
                continue
            m = re.match(r"^#### (P-C\d+-\d+)\s*—\s*(.+)$", riga)
            if not m or dec.get(m.group(1), {}).get("decisione") not in ("approvata", "da_modificare"):
                continue
            proprio = next((r.split("**Sottocriterio:**", 1)[1].strip() for r in righe[i:_blocco(righe, i)]
                            if r.startswith("**Sottocriterio:**")), None)
            chiave = proprio or sotto or criterio
            out.setdefault(chiave, []).append(
                (m.group(1), m.group(2).strip(), dec[m.group(1)]["decisione"] == "da_modificare"))
    return out


def _ripartisci(totale: int, pesi: dict) -> dict:
    """Facciate proporzionali ai punti (resti più grandi), almeno 1 a testa."""
    if not pesi or totale <= 0:
        return {k: 0 for k in pesi}
    somma = sum(pesi.values()) or 1
    quote = {k: max(1.0, totale * v / somma) for k, v in pesi.items()}
    base = {k: int(q) for k, q in quote.items()}
    resto = totale - sum(base.values())
    for k in sorted(quote, key=lambda k: quote[k] - base[k], reverse=True)[:max(resto, 0)]:
        base[k] += 1
    return base


def sezione_b(gara: Path, dec: dict, testo_vincoli: str) -> str:
    matrice = json.loads((gara / "output" / "03_criteria" / "criteria_matrix.json").read_text(encoding="utf-8"))
    domande = gara / "output" / "07_questions" / "domande.json"
    indic = json.loads(domande.read_text(encoding="utf-8")).get("indicazioni", {}) if domande.is_file() else {}
    priorita = {x.get("id"): x for x in indic.get("priorita", []) if x.get("id")}
    approvate = _approvate_per_sottocriterio(gara, dec)

    m = re.search(r"\*\*Limite complessivo:\*\*\s*(\d+)", testo_vincoli)
    limite = int(m.group(1)) if m else None
    tipo_b = bool(re.search(r"\*\*Tipo limite:\*\*\s*TIPO B", testo_vincoli))

    inclusi, esclusi = [], []
    for c in matrice.get("criteria", []):
        cid = c.get("id")
        livello = (priorita.get(cid, {}).get("livello") or c.get("priority") or "").upper()
        sotti = c.get("subcriteria") or [{"id": cid, "description": c.get("title", ""), "max_score": c.get("max_score"),
                                          "nature": c.get("nature")}]
        for sc in sotti:
            sid = sc.get("id") or cid
            natura = (sc.get("nature") or c.get("nature") or "").lower()
            proposte = approvate.get(sid, []) + (approvate.pop(cid, []) if sid == sotti[0].get("id") else [])
            titolo = (sc.get("description") or c.get("title") or "").split(",")[0].strip()
            if len(titolo) > 70:
                titolo = titolo[:67].rstrip() + "…"
            if "tabell" in natura or "quantitat" in natura:
                esclusi.append(f"- {cid} — {sid} ({sc.get('max_score', '?')} pt, {natura}): non va nella relazione, "
                               "si dichiara nei documenti del criterio tabellare.")
            elif not proposte:
                esclusi.append(f"- {cid} — {sid} ({sc.get('max_score', '?')} pt): nessuna proposta approvata in Fase 6, "
                               "nessun punteggio atteso. Da riconsiderare prima di scrivere la relazione.")
            else:
                inclusi.append({"criterio": cid, "sotto": sid, "titolo": titolo, "punti": sc.get("max_score") or 0,
                                "priorita": livello or "MEDIA", "proposte": proposte})

    budget = _ripartisci(limite, {x["sotto"]: float(x["punti"] or 1) for x in inclusi}) if (tipo_b and limite) else {}
    righe = [
        "## Sezione B — Strategia e budget per criterio (da professionista)", "",
        MARCA_SEZIONE_B,
        f"> Compilata automaticamente il {datetime.now(timezone.utc).strftime('%Y-%m-%d')} alla conferma della Fase 6, da: "
        "punteggi del disciplinare (`output/03_criteria/criteria_matrix.json`), indicazioni strategiche della Fase 4 "
        "(`output/07_questions/domande.json`) e proposte approvate (`output/06_registers/decisioni_professionista.md`). "
        + ("Il budget facciate ripartisce il limite complessivo in proporzione ai punti di ciascun subcriterio incluso. "
           if budget else "Il disciplinare non dà un limite complessivo distribuibile: il budget per subcriterio segue la Sezione A. ")
        + "Se la modifichi a mano, togli il commento qui sopra: le conferme successive non la sovrascriveranno.", "",
        "### Criteri inclusi nella relazione tecnica", "",
        "| Criterio | Subcriterio | Punti | Budget facciate | Priorita' | Proposte approvate |",
        "|---|---|---|---|---|---|",
    ]
    for x in inclusi:
        elenco = ", ".join(f"{pid}{' (con modifiche)' if mod else ''}" for pid, _, mod in x["proposte"])
        facc = f"{budget[x['sotto']]} facc" if budget else "vedi Sezione A"
        righe.append(f"| {x['criterio']} | {x['sotto']} — {x['titolo']} | {x['punti']} pt | {facc} | {x['priorita']} | {elenco} |")
    righe += ["", f"**Totale budget assegnato:** {sum(budget.values())} / {limite} facciate" if budget
              else f"**Totale budget assegnato:** secondo i limiti per subcriterio della Sezione A", ""]
    righe += ["### Criteri esclusi dalla relazione tecnica", "", *(esclusi or ["- Nessuno."]), ""]
    righe += ["### Elementi speciali", "",
              "- Nessuno indicato dal professionista. Le proposte possono richiamare schede tecniche ed elaborati grafici "
              "nei limiti della Sezione A.", ""]
    note = [f"- Tono della relazione: {indic['tono']}." if indic.get("tono") else None]
    note += [f"- {cid}: {v['indicazione'].strip()}" for cid, v in priorita.items() if (v.get("indicazione") or "").strip()]
    note += [f"- Vincolo: {v.get('testo', v) if isinstance(v, dict) else v}" for v in indic.get("vincoli", [])]
    note += [f"- Opportunità: {v.get('testo', v) if isinstance(v, dict) else v}" for v in indic.get("opportunita", [])]
    if (indic.get("note") or "").strip():
        note.append(f"- {indic['note'].strip()}")
    modifiche = [(pid, dec[pid]["nota"]) for x in inclusi for pid, _, mod in x["proposte"] if mod]
    if modifiche:
        note.append("- Proposte approvate con modifiche: redigerle applicando la nota del professionista.")
        note += [f"  - {pid}: {' '.join(n.split())}" for pid, n in modifiche]
    righe += ["### Note strategiche", "", *([n for n in note if n] or ["- Nessuna indicazione aggiuntiva."]), ""]
    return "\n".join(righe)


def cmd_vincoli(gara: Path, db: str) -> int:
    f = gara / "vincoli_offerta_tecnica.md"
    if not f.is_file() or not (gara / "output" / "03_criteria" / "criteria_matrix.json").is_file():
        print("vincoli_offerta_tecnica.md o criteria_matrix.json mancante: Sezione B non compilata.", file=sys.stderr)
        return 1
    testo = f.read_text(encoding="utf-8")
    inizio = testo.find("## Sezione B")
    if inizio < 0:
        testo = testo.rstrip("\n") + "\n\n---\n\n"
        inizio = len(testo)
    attuale = testo[inizio:]
    # Si rigenera solo il modello vuoto o una sezione già compilata da qui.
    if attuale.strip() and MARCA_SEZIONE_B not in attuale and "[N]" not in attuale:
        print("Sezione B scritta a mano: non la sovrascrivo.", file=sys.stderr)
        return 0
    f.write_text(testo[:inizio] + sezione_b(gara, decisioni(gara, db), testo), encoding="utf-8")
    return 0


if __name__ == "__main__":
    comandi = {"scrivi": cmd_scrivi, "memoria": cmd_memoria, "vincoli": cmd_vincoli}
    if len(sys.argv) != 4 or sys.argv[1] not in comandi:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    sys.exit(comandi[sys.argv[1]](Path(sys.argv[2]), sys.argv[3]))
