#!/usr/bin/env python3
"""Grafiche della relazione tecnica: registro condiviso fra backend e pipeline.

Il professionista, alla scaletta, sceglie per quali proposte approvate
serve una figura e descrive cosa deve mostrare. Ogni figura ha un id
stabile (fig-01, fig-02, …, mai riusato), un prompt per il modello
d'immagine (preparato da Claude, modificabile), una didascalia in
italiano e, quando c'è, il file dell'immagine.

File: output/10_offer/<id deliverable>/grafiche.json e le immagini in
output/10_offer/<id deliverable>/grafiche/. Il backend scrive il
registro; spada_deliverable.sh lo legge per dire a chi scrive la bozza
dove collocare le figure (`[FIGURA: fig-01]`); md_to_docx.js lo legge
per mettere l'immagine al posto del segnaposto.

Uso da riga di comando (cwd = cartella della gara):
  grafiche_offerta.py elenco <id deliverable>
      Stampa le figure da collocare, per il prompt di chi scrive.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

RE_SEGNAPOSTO = re.compile(r"^\[FIGURA:\s*(fig-\d+)\s*\]\s*$", re.M)
ESTENSIONI = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def ora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def cartella(gara: Path, cartella_dl: str) -> Path:
    """cartella_dl come in raggruppa(): «output/10_offer/<id>»."""
    return gara / cartella_dl


def file_registro(gara: Path, cartella_dl: str) -> Path:
    return cartella(gara, cartella_dl) / "grafiche.json"


def leggi(gara: Path, cartella_dl: str) -> dict:
    try:
        dati = json.loads(file_registro(gara, cartella_dl).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        dati = {}
    dati.setdefault("prossimo", 1)
    dati.setdefault("grafiche", [])
    return dati


def scrivi(gara: Path, cartella_dl: str, dati: dict):
    p = file_registro(gara, cartella_dl)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def segnaposti(testo: str) -> list[str]:
    """Id delle figure collocate nel testo, nell'ordine (= numerazione)."""
    return list(dict.fromkeys(RE_SEGNAPOSTO.findall(testo)))


def da_collocare(gara: Path, cartella_dl: str, approvate: set[str]) -> list[dict]:
    """Figure delle proposte ancora approvate, nell'ordine di creazione."""
    return [g for g in leggi(gara, cartella_dl)["grafiche"] if g.get("proposta_id") in approvate]


# ── Riga di comando (spada_deliverable.sh) ──────────────────────────
def _cli_elenco(did: str) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import deliverables_offerta as offerta
    gara = Path.cwd()
    dl = offerta.trova(offerta._leggi(gara / "manifest.json", {}), did)
    if dl is None or dl["tipo"] != "relazione_tecnica":
        return 0
    approvate = {p["id"]: p for p in offerta.proposte_decise(gara)["approvate"]}
    figure = da_collocare(gara, dl["cartella"], set(approvate))
    if not figure:
        return 0
    print("FIGURE scelte dal professionista per la relazione (una o più per proposta). Collocale così:")
    print("- nella scaletta: indica sotto ogni paragrafo le figure che contiene (qui gli id sono ammessi) e "
          "conta ogni figura come mezza facciata nel limite, salvo che il disciplinare dica altro;")
    print("- nella bozza e nel definitivo: metti il segnaposto `[FIGURA: fig-NN]` su una riga a sé, subito dopo "
          "il capoverso del paragrafo della proposta che la introduce, e citala nel testo come «figura N», "
          "dove N è l'ordine in cui le figure compaiono nel documento (1, 2, 3, …). Non scrivere la didascalia: "
          "la aggiunge l'esportazione. Il segnaposto è l'unico codice ammesso nel testo;")
    print("- non inventare figure che non sono in questo elenco e non togliere quelle elencate.")
    for g in figure:
        p = approvate[g["proposta_id"]]
        did_ = g.get("didascalia") or "(didascalia non ancora scritta)"
        print(f"- {g['id']} — proposta {p['id']} «{p['titolo']}»: mostra {g.get('richiesta', '').strip()} "
              f"Didascalia: {did_}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "elenco":
        sys.exit(_cli_elenco(sys.argv[2]))
    print(__doc__, file=sys.stderr)
    sys.exit(1)
