#!/usr/bin/env python3
"""Schede tecniche della relazione: registro condiviso fra backend e pipeline.

SPADA propone, per le proposte approvate, i prodotti e i componenti che
potrebbero dover presentare un documento del produttore (scheda tecnica,
EPD, dichiarazione di prestazione, certificato, rapporto di prova). Il
professionista sceglie quali includere: SOLO quelle entrano nella
relazione, citate con il segnaposto `[ALLEGATO: sch-NN]` che
l'esportazione numera «Allegato T.1», «Allegato T.2», … nell'ordine in
cui compaiono. Il PDF di ogni scheda inclusa si carica a mano o si cerca
online sul sito del produttore.

File: output/10_offer/<id deliverable>/schede.json e i PDF in
output/10_offer/<id deliverable>/schede/. Il backend scrive il registro;
spada_deliverable.sh lo legge per dire a chi scrive la relazione quali
schede citare; l'esportazione lo legge per numerarle e consegnarle.

Uso da riga di comando (cwd = cartella della gara):
  schede_offerta.py elenco <id deliverable>
      Stampa le schede incluse, per il prompt di chi scrive.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

RE_SEGNAPOSTO = re.compile(r"\[ALLEGATO:\s*(sch-\d+)\s*\]")
PREFISSO = "T"  # «Allegato T.1»: distinto dagli allegati di progetto (Allegato A, b1, …)
CONSEGNE = {
    "in_coda": "in coda alla relazione, nello stesso documento (fuori dal conteggio delle facciate)",
    "file": "file PDF separati, numerati",
    "zip": "un unico archivio ZIP con i PDF numerati",
}
CONSEGNA_PREDEFINITA = "in_coda"
TIPI = {
    "scheda_tecnica": "Scheda tecnica",
    "epd": "Dichiarazione ambientale di prodotto (EPD)",
    "dop": "Dichiarazione di prestazione (DoP)",
    "certificato": "Certificato",
    "rapporto_prova": "Rapporto di prova",
}


def ora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def file_registro(gara: Path, cartella_dl: str) -> Path:
    return gara / cartella_dl / "schede.json"


def leggi(gara: Path, cartella_dl: str) -> dict:
    try:
        dati = json.loads(file_registro(gara, cartella_dl).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        dati = {}
    dati.setdefault("prossimo", 1)
    dati.setdefault("schede", [])
    dati.setdefault("consegna", CONSEGNA_PREDEFINITA)
    return dati


def scrivi(gara: Path, cartella_dl: str, dati: dict):
    p = file_registro(gara, cartella_dl)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def segnaposti(testo: str) -> list[str]:
    """Id delle schede citate nel testo, nell'ordine della prima citazione."""
    return list(dict.fromkeys(RE_SEGNAPOSTO.findall(testo)))


def incluse(gara: Path, cartella_dl: str, approvate: set[str]) -> list[dict]:
    """Schede scelte dal professionista per proposte ancora approvate."""
    return [s for s in leggi(gara, cartella_dl)["schede"] if s.get("inclusa") and s.get("proposta_id") in approvate]


def prodotto(s: dict) -> str:
    return " ".join(x.strip() for x in (s.get("produttore") or "", s.get("modello") or "") if x.strip())


def titolo(s: dict) -> str:
    """Titolo dell'allegato come compare nel documento."""
    base = f"{TIPI.get(s.get('tipo'), 'Scheda tecnica')} – {(s.get('oggetto') or '').strip()}"
    return f"{base} ({prodotto(s)})" if prodotto(s) else base


def numerazione(testo: str, schede_incluse: list[dict]) -> list[dict]:
    """Allegati nell'ordine del documento: prima le schede citate nel testo,
    poi le incluse non citate (in ordine di creazione). Ogni voce porta
    numero («T.1»), titolo, la scheda di origine e se il testo la cita."""
    per_id = {s["id"]: s for s in schede_incluse}
    citate = [i for i in segnaposti(testo) if i in per_id]
    ordine = citate + [s["id"] for s in schede_incluse if s["id"] not in citate]
    return [{"numero": f"{PREFISSO}.{n}", "titolo": titolo(per_id[i]), "scheda": per_id[i], "citata": i in citate}
            for n, i in enumerate(ordine, 1)]


def sostituisci_segnaposti(testo: str, allegati: list[dict]) -> str:
    """`[ALLEGATO: sch-NN]` → «Allegato T.n». Il segnaposto di una scheda non
    più inclusa sparisce, con le sue parentesi: meglio una frase senza
    rimando che un codice nel documento."""
    numeri = {a["scheda"]["id"]: a["numero"] for a in allegati}
    testo = re.sub(r"\s*\(\s*" + RE_SEGNAPOSTO.pattern + r"\s*\)",
                   lambda m: f" (Allegato {numeri[m.group(1)]})" if m.group(1) in numeri else "", testo)
    return RE_SEGNAPOSTO.sub(lambda m: f"Allegato {numeri[m.group(1)]}" if m.group(1) in numeri else "", testo)


# ── Riga di comando (spada_deliverable.sh) ──────────────────────────
def _cli_elenco(did: str) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import deliverables_offerta as offerta
    gara = Path.cwd()
    dl = offerta.trova(offerta._leggi(gara / "manifest.json", {}), did)
    if dl is None or dl["tipo"] != "relazione_tecnica":
        return 0
    approvate = {p["id"]: p for p in offerta.proposte_decise(gara)["approvate"]}
    scelte = incluse(gara, dl["cartella"], set(approvate))
    print("SCHEDE TECNICHE E DOCUMENTI DI PRODOTTO scelti dal professionista come allegati della relazione.")
    if not scelte:
        print("- Nessuno. Non scrivere che sono allegate schede tecniche, EPD, dichiarazioni di prestazione, "
              "certificati o rapporti di prova: i valori di prodotto si descrivono come requisiti dichiarati in "
              "offerta, senza rimandare ad allegati.")
        return 0
    print("Citali così:")
    print("- SOLO questi documenti di prodotto sono allegati: non scrivere che è allegata una scheda, EPD, "
          "dichiarazione di prestazione, certificato o rapporto di prova che non sia in questo elenco;")
    print("- nella scaletta: indica sotto ogni paragrafo i documenti che cita (qui gli id sono ammessi); "
          "gli allegati non contano nel limite di facciate;")
    print("- nella bozza e nel definitivo: nel paragrafo della proposta, dove il testo si appoggia al documento, "
          "metti il rimando con il segnaposto in linea, per esempio «… dichiarato dalla scheda tecnica del "
          "pannello ([ALLEGATO: sch-03]).» L'esportazione lo trasforma in «Allegato T.n». È l'unico codice "
          "ammesso nel testo; cita ogni documento elencato almeno una volta.")
    for s in scelte:
        p = approvate[s["proposta_id"]]
        riga = f"- {s['id']} — {TIPI.get(s.get('tipo'), 'Scheda tecnica')}: {s.get('oggetto', '')}"
        riga += f" ({prodotto(s)})" if prodotto(s) else ""
        riga += f". Proposta {p['id']} «{p['titolo']}»."
        if s.get("documenta"):
            riga += f" Documenta: {s['documenta']}"
        print(riga)
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "elenco":
        sys.exit(_cli_elenco(sys.argv[2]))
    print(__doc__, file=sys.stderr)
    sys.exit(1)
