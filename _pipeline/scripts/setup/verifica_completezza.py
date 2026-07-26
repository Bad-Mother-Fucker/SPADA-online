#!/usr/bin/env python3
"""verifica_completezza.py — gate obbligatorio prima della Fase 3
(analisi strategica), Sprint 8.5.

Chiude un difetto noto del modello precedente: un'analisi prezzi con
categorie mancanti nel campione poteva dipendere da un'estrazione
testuale incompleta (documenti caricati ma non ancora convertiti in
output/01_extracted/text/), non da un'assenza reale dei documenti di
riferimento — e la differenza non era mai verificata esplicitamente
prima di far girare strategy-auditor.

Legge input/_manifest_input.md (scritto da document-preprocessor,
Fase 1) e blocca se un documento non di tipo "tavola" non risulta
Stato=estratto. Le tavole sono lette da drawing-reader, non da
estrazione testuale: esenti da questo gate.

Uso:
  python3 verifica_completezza.py <cartella_gara>

Uscita 0 se completo, 1 se mancano estrazioni (stampa l'elenco su
stderr). Non decide da solo se procedere comunque: e' spada_fase.sh
(o l'operatore) a scegliere se bloccare la Fase 3 o forzare la
prosecuzione con conoscenza del rischio.
"""
import re
import sys
from pathlib import Path


def parse_manifest(path: Path):
    if not path.exists():
        return None  # nessun censimento ancora: non e' compito di questo script segnalarlo
    righe = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("|") or set(line.replace("|", "").strip()) <= {"-", " "}:
            continue
        celle = [c.strip() for c in line.strip("|").split("|")]
        if celle and celle[0].lower() == "codice":
            continue  # riga di intestazione
        if len(celle) < 6:
            continue
        righe.append({
            "codice": celle[0], "file": celle[1], "sezione": celle[3],
            "tipo": celle[4], "stato": celle[5],
        })
    return righe


def main():
    if len(sys.argv) != 2:
        print("Uso: verifica_completezza.py <cartella_gara>", file=sys.stderr)
        sys.exit(2)

    gara_dir = Path(sys.argv[1])
    manifest_path = gara_dir / "input" / "_manifest_input.md"
    righe = parse_manifest(manifest_path)

    if righe is None:
        print(f"✗ {manifest_path} non trovato: la Fase 1 (censimento) non risulta eseguita.", file=sys.stderr)
        sys.exit(1)

    incompleti = [
        r for r in righe
        if r["tipo"].lower() != "tavola" and r["stato"].strip().lower() != "estratto"
    ]

    if incompleti:
        print("✗ Estrazione incompleta — i seguenti documenti non sono ancora estratti "
              "(Stato diverso da 'estratto'):", file=sys.stderr)
        for r in incompleti:
            print(f"  - {r['codice']} ({r['file']}) — stato: {r['stato']}", file=sys.stderr)
        print("\nL'analisi strategica (Fase 3) su un grafo con testi mancanti puo' "
              "produrre un gap prezzi con categorie 'non coperte' che sembrano un limite "
              "dei dati di riferimento, quando e' invece un limite dell'estrazione. "
              "Completa l'estrazione (document-preprocessor) prima di procedere.", file=sys.stderr)
        sys.exit(1)

    print(f"✓ Estrazione completa: {len(righe)} documenti censiti, tutti estratti o di tipo tavola.")
    sys.exit(0)


if __name__ == "__main__":
    main()
