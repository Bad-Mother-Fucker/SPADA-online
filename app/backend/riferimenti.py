"""Immagine di riferimento delle figure: pagine degli elaborati e ritagli.

Un riferimento preso dagli elaborati è (file, pagina, riquadro): il
riquadro è in frazioni della pagina (x0, y0, x1, y1, origine in alto a
sinistra), così non dipende dalla risoluzione. L'immagine si ricava con
pdftoppm direttamente alla risoluzione giusta per il ritaglio: una tavola
A0 renderizzata intera e poi tagliata darebbe un dettaglio sgranato.

Gli elaborati firmati (.p7m) si leggono dal PDF estratto in
output/_cache/pdf/, prodotto una volta sola con openssl.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path

CACHE_PDF = Path("output") / "_cache" / "pdf"
LATO_RITAGLIO = 1536      # lato lungo del ritaglio in pixel: quanto chiede il modello d'immagine
LATO_ANTEPRIMA = 1600     # lato lungo della pagina intera mostrata per regolare il ritaglio
DPI_MAX = 600
RIQUADRO_MIN = 0.02       # lato minimo del riquadro, in frazione della pagina
TIMEOUT = 120


class ErroreRiferimento(RuntimeError):
    pass


def _esegui(argv: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(argv, capture_output=True, timeout=TIMEOUT)
    except FileNotFoundError:
        raise ErroreRiferimento(f"Manca il programma {argv[0]} sul server (poppler-utils o openssl).")
    except subprocess.TimeoutExpired:
        raise ErroreRiferimento(f"{argv[0]} non ha finito entro {TIMEOUT} secondi.")


def pdf_da_p7m(gara: Path, p7m: Path) -> Path:
    """PDF contenuto in un .p7m, estratto in cache (una volta sola)."""
    out = gara / CACHE_PDF / p7m.name.removesuffix(".p7m").removesuffix(".P7M")
    if not out.name.lower().endswith(".pdf"):
        out = out.with_name(out.name + ".pdf")
    if out.is_file() and out.stat().st_mtime >= p7m.stat().st_mtime:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    for formato in ("DER", "PEM"):
        r = _esegui(["openssl", "cms", "-verify", "-noverify", "-inform", formato, "-in", str(p7m), "-out", str(tmp)])
        if r.returncode == 0 and tmp.is_file() and tmp.read_bytes()[:5] == b"%PDF-":
            tmp.replace(out)
            return out
    tmp.unlink(missing_ok=True)
    raise ErroreRiferimento(f"Il file firmato «{p7m.name}» non si apre: il PDF contenuto non è leggibile.")


def prepara_cache(gara: Path) -> int:
    """Estrae tutti i PDF firmati di input/, perché Claude possa guardarli.
    Restituisce quanti ne sono leggibili; quelli rotti si saltano."""
    n = 0
    for p7m in sorted((gara / "input").rglob("*.p7m")):
        try:
            pdf_da_p7m(gara, p7m)
            n += 1
        except ErroreRiferimento:
            continue
    return n


def risolvi(gara: Path, rel: str) -> Path:
    """Percorso indicato (input/…, output/_cache/pdf/…) → PDF leggibile,
    sempre dentro la gara."""
    rel = rel.strip().lstrip("/")
    f = (gara / rel).resolve()
    if gara.resolve() not in f.parents or not f.is_file():
        raise ErroreRiferimento(f"File non trovato fra gli elaborati: {rel}")
    if f.name.lower().endswith(".p7m"):
        return pdf_da_p7m(gara, f)
    if not f.name.lower().endswith(".pdf"):
        raise ErroreRiferimento(f"Il riferimento deve venire da un PDF: {rel}")
    return f


def nome_leggibile(rel: str) -> str:
    """«input/elaborati/Allegato A_Relazione Generale_Lotto 1(1).pdf.p7m» → «Allegato A Relazione Generale Lotto 1»."""
    n = Path(rel).name
    n = re.sub(r"(\.pdf)?(\.p7m)?$", "", n, flags=re.I)
    n = re.sub(r"\(\d+\)|_compressed", "", n)
    return re.sub(r"[_\s]+", " ", n).strip()


def pagine(pdf: Path) -> int:
    r = _esegui(["pdfinfo", str(pdf)])
    m = re.search(rb"^Pages:\s+(\d+)", r.stdout, re.M)
    if not m:
        raise ErroreRiferimento(f"PDF non leggibile: {pdf.name}")
    return int(m.group(1))


def dimensioni_pagina(pdf: Path, pagina: int) -> tuple[float, float]:
    """Larghezza e altezza in punti, tenendo conto della rotazione."""
    r = _esegui(["pdfinfo", "-f", str(pagina), "-l", str(pagina), str(pdf)])
    m = re.search(rb"Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)", r.stdout)
    rot = re.search(rb"Page\s+\d+\s+rot:\s+(\d+)", r.stdout)
    if not m:
        raise ErroreRiferimento(f"Pagina {pagina} non leggibile in {pdf.name}")
    w, h = float(m.group(1)), float(m.group(2))
    return (h, w) if rot and int(rot.group(1)) % 180 == 90 else (w, h)


def normalizza_riquadro(r) -> list[float]:
    try:
        x0, y0, x1, y1 = (min(1.0, max(0.0, float(v))) for v in r)
    except (TypeError, ValueError):
        return [0.0, 0.0, 1.0, 1.0]
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    if x1 - x0 < RIQUADRO_MIN or y1 - y0 < RIQUADRO_MIN:
        return [0.0, 0.0, 1.0, 1.0]
    return [round(v, 4) for v in (x0, y0, x1, y1)]


def _render(pdf: Path, pagina: int, dpi: float, crop: tuple[int, int, int, int] | None, out: Path):
    out.parent.mkdir(parents=True, exist_ok=True)
    base = out.with_suffix("")
    argv = ["pdftoppm", "-f", str(pagina), "-l", str(pagina), "-r", f"{dpi:.2f}", "-png", "-singlefile"]
    if crop:
        x, y, w, h = crop
        argv += ["-x", str(x), "-y", str(y), "-W", str(w), "-H", str(h)]
    r = _esegui(argv + [str(pdf), str(base)])
    if r.returncode != 0 or not out.is_file():
        raise ErroreRiferimento(f"Pagina {pagina} di «{pdf.name}» non renderizzata: {r.stderr.decode(errors='ignore')[-200:]}")


def ritaglia(pdf: Path, pagina: int, riquadro: list[float], out: Path):
    """Scrive in `out` il ritaglio, con il lato lungo di circa LATO_RITAGLIO px."""
    if not 1 <= pagina <= pagine(pdf):
        raise ErroreRiferimento(f"«{pdf.name}» non ha la pagina {pagina}.")
    w_pt, h_pt = dimensioni_pagina(pdf, pagina)
    x0, y0, x1, y1 = riquadro
    lato_pt = max((x1 - x0) * w_pt, (y1 - y0) * h_pt)
    dpi = min(DPI_MAX, LATO_RITAGLIO * 72 / lato_pt)
    k = dpi / 72
    crop = (int(x0 * w_pt * k), int(y0 * h_pt * k), max(1, int((x1 - x0) * w_pt * k)), max(1, int((y1 - y0) * h_pt * k)))
    _render(pdf, pagina, dpi, crop, out)


def anteprima_pagina(gara: Path, pdf: Path, pagina: int) -> Path:
    """Pagina intera per regolare il ritaglio, in cache."""
    chiave = hashlib.sha1(f"{pdf}:{pdf.stat().st_mtime}:{pagina}".encode()).hexdigest()[:16]
    out = gara / "output" / "_cache" / "pagine" / f"{chiave}.png"
    if not out.is_file():
        w_pt, h_pt = dimensioni_pagina(pdf, pagina)
        _render(pdf, pagina, LATO_ANTEPRIMA * 72 / max(w_pt, h_pt), None, out)
    return out
