"""Esportazione del definitivo di un deliverable in DOCX e PDF.

DOCX: _pipeline/scripts/offer/md_to_docx.js, con font, corpo e
interlinea della Sezione A di vincoli_offerta_tecnica.md (quelli del
disciplinare, non dei default) e i dati di gara del manifest in
copertina. PDF: dal DOCX, con docx_to_pdf.sh (LibreOffice o Word).
Nessun modello coinvolto: è una conversione, il testo resta quello
approvato.
"""
import json
import re
import subprocess
from pathlib import Path

from paths import PIPELINE_DIR

TIMEOUT = 180


def _formato_sezione_a(gara: Path) -> dict:
    f = gara / "vincoli_offerta_tecnica.md"
    testo = f.read_text(encoding="utf-8") if f.is_file() else ""

    def campo(nome):
        m = re.search(rf"\*\*{nome}:\*\*\s*([^\n(]+)", testo)
        v = (m.group(1).strip() if m else "")
        return "" if not v or v.startswith("[") else v
    out = {}
    if (font := campo("Font")):
        out["font"] = font.split("/")[0].strip()
    if (m := re.search(r"(\d+(?:[.,]\d+)?)\s*pt", campo("Dimensione"))):
        out["size"] = m.group(1).replace(",", ".")
    if (m := re.search(r"(\d+(?:[.,]\d+)?)", campo("Interlinea"))):
        out["interlinea"] = m.group(1).replace(",", ".")
    return out


def esporta(gara: Path, dl: dict, sorgente: Path, formato: str) -> Path:
    cartella = sorgente.parent
    base = re.sub(r"[^A-Za-z0-9]+", "_", dl["nome"]).strip("_")[:60] or dl["id"]
    docx = cartella / f"{base}.docx"
    manifest = json.loads((gara / "manifest.json").read_text(encoding="utf-8"))
    g = manifest.get("gara") or {}
    argv = ["node", str(PIPELINE_DIR / "scripts" / "offer" / "md_to_docx.js"), str(sorgente), str(docx),
            "--titolo", dl["nome"], "--gara", manifest.get("nome") or "", "--cig", str(g.get("CIG") or ""),
            "--sa", str(g.get("stazione_appaltante") or "")]
    for k, v in _formato_sezione_a(gara).items():
        argv += [f"--{k}", v]
    if dl["tipo"] != "relazione_tecnica":
        argv.append("--senza-numeri-riga")
    elif (registro := cartella / "grafiche.json").is_file():
        argv += ["--figure", str(registro)]  # [FIGURA: fig-NN] → immagine e didascalia  # la numerazione delle righe serve al limite di facciate della relazione
    r = subprocess.run(argv, cwd=gara, capture_output=True, text=True, timeout=TIMEOUT)
    if r.returncode != 0 or not docx.is_file():
        raise RuntimeError(f"Conversione in DOCX non riuscita: {(r.stderr or r.stdout).strip()[-400:]}")
    if formato == "docx":
        return docx
    pdf = docx.with_suffix(".pdf")
    r = subprocess.run(["bash", str(PIPELINE_DIR / "scripts" / "offer" / "docx_to_pdf.sh"), str(docx), str(pdf)],
                       capture_output=True, text=True, timeout=TIMEOUT)
    if r.returncode != 0 or not pdf.is_file():
        raise RuntimeError((r.stderr or "Conversione in PDF non riuscita.").strip()[-400:])
    return pdf
