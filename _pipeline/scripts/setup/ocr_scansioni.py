#!/usr/bin/env python3
"""ocr_scansioni.py — testo dei PDF scansionati di una gara, con Tesseract.

document-preprocessor (Fase 1) estrae il testo dei PDF che ne hanno uno e
segna in input/_manifest_input.md "scansione_senza_testo (OCR
necessario)" quelli che sono solo immagini. Senza questo script nessuno
li leggeva: il gate di completezza prima della Fase 3
(verifica_completezza.py) restava chiuso per sempre.

Per ogni riga in quello stato: pagine a 300 dpi in scala di grigi
(pdftoppm), OCR in italiano (tesseract), testo in
output/01_extracted/text/<codice>_<nome>.md, riga del manifest aggiornata
a "estratto (OCR)". Idempotente: le righe già estratte non si toccano.

Tesseract si cerca in SPADA_TESSERACT, poi nel PATH, poi in
$SPADA_HOME/_ocr/tesseract (copia locale senza sudo, vedi README).

Uso:
  python3 ocr_scansioni.py <cartella_gara>

Uscita 0 se non resta nessuna scansione da leggere, 1 altrimenti.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

STATO_SCANSIONE = "scansione_senza_testo"
DPI = "300"


def trova_tesseract() -> str | None:
    candidati = [os.environ.get("SPADA_TESSERACT"), shutil.which("tesseract"),
                 str(Path(os.environ.get("SPADA_HOME", Path.home() / "spada")) / "_ocr" / "tesseract")]
    for c in candidati:
        if c and os.access(c, os.X_OK):
            return c
    return None


def lingue(tesseract: str) -> str:
    """ita se c'è (con eng per sigle e unità), altrimenti quello che c'è."""
    try:
        out = subprocess.run([tesseract, "--list-langs"], capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.TimeoutExpired):
        return "eng"
    disponibili = set(out.split())
    scelte = [x for x in ("ita", "eng") if x in disponibili]
    return "+".join(scelte) or "eng"


def nome_testo(codice: str, file: str) -> str:
    base = re.sub(r"_signed", "", Path(file).stem)
    base = re.sub(r"^\s*\d+\s*-\s*", "", base)
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_")
    return f"{codice}_{base}.md" if base else f"{codice}.md"


def ocr_pdf(tesseract: str, lang: str, pdf: Path) -> str:
    with tempfile.TemporaryDirectory(prefix="spada-ocr-") as tmp:
        subprocess.run(["pdftoppm", "-r", DPI, "-gray", "-png", str(pdf), os.path.join(tmp, "p")],
                       check=True, capture_output=True, timeout=30 * 60)
        pagine = sorted(Path(tmp).glob("p-*.png"))
        env = {**os.environ, "OMP_THREAD_LIMIT": "1"}  # parallelismo per pagina, non dentro tesseract

        def leggi(png: Path) -> str:
            r = subprocess.run([tesseract, str(png), "-", "-l", lang, "--psm", "6"],
                               capture_output=True, text=True, timeout=10 * 60, env=env)
            return r.stdout.strip()

        with ThreadPoolExecutor(max_workers=max(1, min(4, os.cpu_count() or 1))) as ex:
            testi = list(ex.map(leggi, pagine))
    return "\n\n".join(f"<!-- pagina {i} -->\n{t}" for i, t in enumerate(testi, 1))


def main():
    if len(sys.argv) != 2:
        print("Uso: ocr_scansioni.py <cartella_gara>", file=sys.stderr)
        sys.exit(2)
    gara = Path(sys.argv[1])
    manifest = gara / "input" / "_manifest_input.md"
    if not manifest.exists():
        sys.exit(0)  # nessun censimento: lo segnala verifica_completezza.py

    righe = manifest.read_text(encoding="utf-8").splitlines()
    da_leggere = []
    for i, riga in enumerate(righe):
        celle = [c.strip() for c in riga.strip().strip("|").split("|")] if riga.strip().startswith("|") else []
        if len(celle) >= 7 and celle[5].lower().startswith(STATO_SCANSIONE):
            da_leggere.append((i, celle))
    if not da_leggere:
        sys.exit(0)

    tesseract = trova_tesseract()
    if not tesseract:
        print("✗ OCR non disponibile: Tesseract non è installato. Su Ubuntu/WSL: "
              "sudo apt install tesseract-ocr tesseract-ocr-ita; su Mac: brew install tesseract tesseract-lang.",
              file=sys.stderr)
        sys.exit(1)
    lang = lingue(tesseract)
    cartella = gara / "output" / "01_extracted" / "text"
    cartella.mkdir(parents=True, exist_ok=True)

    falliti = 0
    for i, celle in da_leggere:
        codice, file, percorso = celle[0], celle[1], celle[2]
        pdf = gara / percorso
        print(f"▶ OCR di {file}…", flush=True)
        try:
            testo = ocr_pdf(tesseract, lang, pdf)
        except (OSError, subprocess.SubprocessError) as e:
            print(f"✗ OCR non riuscito su {file}: {e}", file=sys.stderr)
            falliti += 1
            continue
        if len(re.sub(r"<!--.*?-->|\s", "", testo)) < 50:
            print(f"✗ OCR di {file}: nessun testo leggibile.", file=sys.stderr)
            falliti += 1
            continue
        uscita = cartella / nome_testo(codice, file)
        uscita.write_text(
            f"# {file}\n\n> Testo ricavato con OCR (Tesseract, {lang}) da un PDF scansionato: "
            "numeri e importi vanno verificati sul documento originale prima di citarli.\n\n"
            + testo + "\n", encoding="utf-8")
        celle[5] = "estratto (OCR)"
        celle[6] = str(uscita.relative_to(gara))
        righe[i] = "| " + " | ".join(celle) + " |"
        print(f"✓ {file} → {celle[6]}", flush=True)

    manifest.write_text("\n".join(righe) + "\n", encoding="utf-8")
    sys.exit(1 if falliti else 0)


if __name__ == "__main__":
    main()
