"""Esportazione del definitivo di un deliverable in DOCX e PDF.

DOCX: _pipeline/scripts/offer/md_to_docx.js, con font, corpo e
interlinea della Sezione A di vincoli_offerta_tecnica.md (quelli del
disciplinare, non dei default) e i dati di gara del manifest in
copertina. PDF: dal DOCX, con docx_to_pdf.sh (LibreOffice o Word).
Nessun modello coinvolto: è una conversione, il testo resta quello
approvato.

Relazione tecnica: le schede tecniche incluse dal professionista
(schede_offerta.py) diventano «Allegato T.n», numerate nell'ordine in cui
il testo le cita, e si consegnano come ha scelto:
- in coda (predefinito): nello stesso documento, dopo un elenco degli
  allegati; nel DOCX le pagine sono immagini, nel PDF i PDF originali;
- file sciolti: PDF numerati in allegati/, più l'elenco nel documento;
- ZIP: gli stessi PDF in un archivio, più l'elenco nel documento.
In tutti i casi gli allegati stanno dopo la relazione, senza numeri di
riga: non entrano nel conteggio delle facciate.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from paths import PIPELINE_DIR

sys.path.insert(0, str(PIPELINE_DIR / "scripts" / "setup"))
import deliverables_offerta as offerta  # noqa: E402
import schede_offerta  # noqa: E402

TIMEOUT = 180
TIMEOUT_PAGINE = 600
LATO_DOCX = "1700"  # pixel del lato lungo delle pagine delle schede nel DOCX: A4 leggibile, tavole grandi non pesano
RE_FRONTESPIZIO = re.compile(r"^\s*Allegato (T\.\d+)\s*$", re.M)


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


def _esegui(argv: list[str], cwd: Path | None = None, timeout: int = TIMEOUT) -> subprocess.CompletedProcess:
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)


# ── Schede tecniche ─────────────────────────────────────────────────
def allegati_relazione(gara: Path, dl: dict, testo: str) -> tuple[list[dict], str]:
    """Allegati numerati e modalità di consegna. Ogni voce ha anche «pdf»,
    il percorso del file se c'è."""
    dati = schede_offerta.leggi(gara, dl["cartella"])
    approvate = {p["id"] for p in offerta.proposte_decise(gara)["approvate"]}
    allegati = schede_offerta.numerazione(testo, schede_offerta.incluse(gara, dl["cartella"], approvate))
    for a in allegati:
        f = gara / dl["cartella"] / a["scheda"]["file"] if a["scheda"].get("file") else None
        a["pdf"] = f if f is not None and f.is_file() else None
    return allegati, dati["consegna"]


def _nome_file(a: dict) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "_", a["titolo"]).strip("_")[:70]
    return f"Allegato_{a['numero']}_{base}.pdf"


def _voci_json(allegati: list[dict], pagine: dict | None, consegna: str) -> list[dict]:
    """Voci per md_to_docx.js. In coda: frontespizi, con le immagini delle
    pagine (DOCX) o senza (PDF, dove si uniscono gli originali). File
    sciolti o ZIP: solo l'elenco, con il nome del file di ciascuno."""
    in_coda = consegna == "in_coda"
    return [{"numero": a["numero"], "titolo": a["titolo"],
             "nota": "" if a["pdf"] else "PDF non ancora disponibile: caricalo nel pannello Schede tecniche",
             "file": "" if in_coda or not a["pdf"] else _nome_file(a),
             "frontespizio": in_coda, "pagine": (pagine or {}).get(a["numero"], [])} for a in allegati]


def _pagine_png(allegati: list[dict], tmp: Path) -> dict:
    out = {}
    for a in allegati:
        if not a["pdf"]:
            continue
        pref = tmp / a["numero"].replace(".", "_")
        _esegui(["pdftoppm", "-scale-to", LATO_DOCX, "-jpeg", "-jpegopt", "quality=82", str(a["pdf"]), str(pref)],
                timeout=TIMEOUT_PAGINE)
        out[a["numero"]] = [str(p) for p in sorted(tmp.glob(pref.name + "-*.jpg"))]
    return out


def _consegna_separata(cartella: Path, allegati: list[dict], consegna: str, base: str):
    """File sciolti in allegati/ oppure un unico ZIP, rigenerati a ogni esportazione."""
    dir_allegati = cartella / "allegati"
    zip_file = cartella / f"Allegati_{base}.zip"
    if dir_allegati.is_dir():
        shutil.rmtree(dir_allegati)  # copie dei PDF in schede/: si rigenerano
    zip_file.unlink(missing_ok=True)
    con_pdf = [a for a in allegati if a["pdf"]]
    if consegna == "file":
        dir_allegati.mkdir(parents=True)
        for a in con_pdf:
            shutil.copyfile(a["pdf"], dir_allegati / _nome_file(a))
    elif consegna == "zip" and con_pdf:
        with zipfile.ZipFile(zip_file, "w", zipfile.ZIP_DEFLATED) as z:
            for a in con_pdf:
                z.write(a["pdf"], _nome_file(a))


def _unisci_pdf(pdf_relazione: Path, allegati: list[dict], uscita: Path, tmp: Path):
    """Relazione (con elenco e frontespizi) + PDF originali delle schede,
    ciascuno subito dopo il suo frontespizio."""
    info = _esegui(["pdfinfo", str(pdf_relazione)]).stdout
    totale = int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))
    frontespizi = {}
    for n in range(totale, 0, -1):  # i frontespizi sono in fondo: si cerca a ritroso
        testo = _esegui(["pdftotext", "-layout", "-f", str(n), "-l", str(n), str(pdf_relazione), "-"]).stdout
        if (m := RE_FRONTESPIZIO.search(testo)):
            frontespizi[m.group(1)] = n
        if len(frontespizi) == len(allegati):
            break
    if len(frontespizi) != len(allegati):
        raise RuntimeError("Unione degli allegati non riuscita: frontespizi non riconosciuti nel PDF della relazione.")
    pagine = tmp / "pagine"
    pagine.mkdir()
    _esegui(["pdfseparate", str(pdf_relazione), str(pagine / "p-%d.pdf")], timeout=TIMEOUT_PAGINE)
    primo = min(frontespizi.values())
    sequenza = [str(pagine / f"p-{n}.pdf") for n in range(1, primo)]
    for a in allegati:
        sequenza.append(str(pagine / f"p-{frontespizi[a['numero']]}.pdf"))
        if a["pdf"]:
            sequenza.append(str(a["pdf"]))
    r = _esegui(["pdfunite", *sequenza, str(uscita)], timeout=TIMEOUT_PAGINE)
    if r.returncode != 0 or not uscita.is_file():
        raise RuntimeError(f"Unione degli allegati non riuscita: {(r.stderr or r.stdout).strip()[-300:]}")


# ── Conversione ─────────────────────────────────────────────────────
def _docx(gara: Path, dl: dict, sorgente: Path, uscita: Path, extra: list[str]):
    manifest = json.loads((gara / "manifest.json").read_text(encoding="utf-8"))
    g = manifest.get("gara") or {}
    argv = ["node", str(PIPELINE_DIR / "scripts" / "offer" / "md_to_docx.js"), str(sorgente), str(uscita),
            "--titolo", dl["nome"], "--gara", manifest.get("nome") or "", "--cig", str(g.get("CIG") or ""),
            "--sa", str(g.get("stazione_appaltante") or "")]
    for k, v in _formato_sezione_a(gara).items():
        argv += [f"--{k}", v]
    if dl["tipo"] != "relazione_tecnica":
        argv.append("--senza-numeri-riga")  # la numerazione delle righe serve al limite di facciate della relazione
    elif (registro := sorgente.parent / "grafiche.json").is_file():
        argv += ["--figure", str(registro)]  # [FIGURA: fig-NN] → immagine e didascalia
    r = _esegui(argv + extra, cwd=gara)
    if r.returncode != 0 or not uscita.is_file():
        raise RuntimeError(f"Conversione in DOCX non riuscita: {(r.stderr or r.stdout).strip()[-400:]}")


def _pdf(docx: Path, pdf: Path):
    r = _esegui(["bash", str(PIPELINE_DIR / "scripts" / "offer" / "docx_to_pdf.sh"), str(docx), str(pdf)])
    if r.returncode != 0 or not pdf.is_file():
        raise RuntimeError((r.stderr or "Conversione in PDF non riuscita.").strip()[-400:])


def esporta(gara: Path, dl: dict, sorgente: Path, formato: str) -> Path:
    cartella = sorgente.parent
    base = re.sub(r"[^A-Za-z0-9]+", "_", dl["nome"]).strip("_")[:60] or dl["id"]
    docx = cartella / f"{base}.docx"
    if dl["tipo"] != "relazione_tecnica":
        _docx(gara, dl, sorgente, docx, [])
        if formato == "docx":
            return docx
        _pdf(docx, docx.with_suffix(".pdf"))
        return docx.with_suffix(".pdf")

    testo = sorgente.read_text(encoding="utf-8")
    allegati, consegna = allegati_relazione(gara, dl, testo)
    with tempfile.TemporaryDirectory(prefix="spada-esporta-") as t:
        tmp = Path(t)
        # Il testo con «Allegato T.n» al posto dei segnaposti; il file
        # approvato non si tocca. Accanto al sorgente: stessi percorsi relativi.
        md = cartella / f".esportazione_{sorgente.name}"
        md.write_text(schede_offerta.sostituisci_segnaposti(testo, allegati), encoding="utf-8")
        try:
            if consegna != "in_coda":
                _consegna_separata(cartella, allegati, consegna, base)
            def con_allegati(pagine):
                if not allegati:
                    return []
                j = tmp / "allegati.json"
                j.write_text(json.dumps(_voci_json(allegati, pagine, consegna), ensure_ascii=False), encoding="utf-8")
                return ["--allegati", str(j)]
            if formato == "docx":
                pagine = _pagine_png(allegati, tmp) if consegna == "in_coda" else None
                _docx(gara, dl, md, docx, con_allegati(pagine))
                return docx
            # PDF: le schede in coda entrano come PDF originali, non come immagini.
            docx_pdf = tmp / f"{base}.docx"
            _docx(gara, dl, md, docx_pdf, con_allegati(None))
            pdf = docx.with_suffix(".pdf")
            if consegna == "in_coda" and allegati:
                relazione = tmp / f"{base}_relazione.pdf"
                _pdf(docx_pdf, relazione)
                _unisci_pdf(relazione, allegati, pdf, tmp)
            else:
                _pdf(docx_pdf, pdf)
            return pdf
        finally:
            md.unlink(missing_ok=True)
