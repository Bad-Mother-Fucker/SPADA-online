"""Prezzario di riferimento di una gara: presenza, rielaborazioni,
importazione.

Una gara si crea e si esegue anche senza il prezzario della propria
regione/anno: le fasi saltano le valutazioni economiche (vedi
_pipeline/scripts/setup/prezzario_gara.py, che lo scrive nel prompt) e
run_log.json registra `prezzario_version: null`. Da qui il pannello
della gara sa due cose:

- se il prezzario manca → avviso con invito a importarlo;
- se è arrivato dopo → quali elaborazioni economiche sono state fatte
  senza e vanno rieseguite.

Il confronto sulla regione ignora maiuscole/minuscole, come
prezzario_gara.py: è la stessa ricerca, vista dal backend.
"""
import json
import re
import sqlite3
import subprocess
import threading
from pathlib import Path

from deliverables import elenca_deliverables
from paths import DB_PATH, PIPELINE_DIR

# Fasi che fanno valutazioni economiche sul prezzario: la 3
# (strategy-auditor: gap prezzi, capacità di investimento). Tra i
# deliverable, il computo metrico delle migliorie.
FASI_ECONOMICHE = {3: "Fase 3 — Analisi strategica"}
DELIVERABLE_ECONOMICI = {"computo_metrico"}

REGIONE_RE = re.compile(r"^[A-Za-zÀ-ÿ' -]{2,40}$")
_LOCK_IMPORT = threading.Lock()


class ImportazioneNonRiuscita(RuntimeError):
    pass


def edizioni_installate() -> list[dict]:
    if not DB_PATH.exists():
        return []
    try:
        con = sqlite3.connect(str(DB_PATH))
        try:
            righe = con.execute(
                "SELECT regione, anno, importato_il, totale_voci_articoli FROM prezzario_versioni"
            ).fetchall()
        finally:
            con.close()
    except sqlite3.OperationalError:
        return []  # tabella non ancora creata: nessun import eseguito
    return [{"regione": r[0], "anno": r[1], "importato_il": r[2], "totale_voci": r[3]} for r in righe]


def _edizione(regione: str, anno) -> dict | None:
    for e in edizioni_installate():
        if e["regione"].lower() == (regione or "").strip().lower() and e["anno"] == anno:
            return e
    return None


def regione_canonica(regione: str) -> str:
    """Il nome della regione come compare nel database, se c'è già
    un'edizione importata per quella regione; altrimenti quello scritto,
    con l'iniziale maiuscola. Evita che "campania" e "Campania" diventino
    due regioni diverse."""
    r = " ".join((regione or "").split())
    for e in edizioni_installate():
        if e["regione"].lower() == r.lower():
            return e["regione"]
    return r[:1].upper() + r[1:]


def _da_rielaborare(gara_dir: Path) -> list[dict]:
    """Elaborazioni economiche la cui ULTIMA esecuzione completata è
    avvenuta senza prezzario (prezzario_version null in run_log.json)."""
    try:
        runs = json.loads((gara_dir / "_state" / "run_log.json").read_text(encoding="utf-8")).get("runs", [])
    except Exception:
        return []
    tipi_deliverable = {d["id"]: d for d in elenca_deliverables(gara_dir)}

    ultime = {}
    for run in runs:  # in ordine di esecuzione: l'ultima vince
        if run.get("esito") != "completato" or str(run.get("modello", "")).startswith("n/a"):
            continue  # le approvazioni non elaborano nulla
        dl = run.get("deliverable_id")
        if dl:
            if (tipi_deliverable.get(dl) or {}).get("tipo") in DELIVERABLE_ECONOMICI:
                ultime[("deliverable", dl)] = run
        elif run.get("fase") in FASI_ECONOMICHE:
            ultime[("fase", run["fase"])] = run

    risultato = []
    for (tipo, chiave), run in sorted(ultime.items(), key=lambda kv: str(kv[0])):
        if run.get("prezzario_version") is not None:
            continue
        if tipo == "fase":
            risultato.append({"tipo": "fase", "fase": chiave, "etichetta": FASI_ECONOMICHE[chiave]})
        else:
            nome = tipi_deliverable[chiave].get("nome") or chiave
            risultato.append({"tipo": "deliverable", "id": chiave, "etichetta": f"{nome} ({chiave})"})
    return risultato


def stato_prezzario(gara_dir: Path, manifest: dict) -> dict:
    prezzario = (manifest or {}).get("prezzario") or {}
    regione = str(prezzario.get("regione") or "").strip()
    anno = prezzario.get("anno")
    edizione = _edizione(regione, anno) if regione and isinstance(anno, int) else None
    return {
        "regione": edizione["regione"] if edizione else regione,
        "anno": anno,
        "disponibile": edizione is not None,
        "totale_voci": edizione["totale_voci"] if edizione else None,
        # Solo se il prezzario c'è: se manca, rieseguire non cambierebbe nulla.
        "da_rielaborare": _da_rielaborare(gara_dir) if edizione else [],
    }


def _valida(regione: str, anno: int) -> str:
    regione = regione_canonica(regione)
    if not REGIONE_RE.match(regione):
        raise ValueError(f"Regione non valida: {regione!r}")
    if not 2000 <= int(anno) <= 2100:
        raise ValueError(f"Anno non valido: {anno}")
    return regione


def _esegui_import(regione: str, anno: int, *origine: str) -> subprocess.CompletedProcess:
    """import_prezzario.sh, una sola importazione alla volta. `origine`:
    eventuale terzo argomento dello script (cartella o file .dcf)."""
    if not _LOCK_IMPORT.acquire(blocking=False):
        raise ImportazioneNonRiuscita("È già in corso un'altra importazione: riprova tra poco.")
    try:
        script = PIPELINE_DIR / "scripts" / "setup" / "import_prezzario.sh"
        return subprocess.run(
            ["bash", str(script), regione, str(int(anno)), *origine],
            capture_output=True, text=True, timeout=15 * 60,
        )
    except subprocess.TimeoutExpired:
        raise ImportazioneNonRiuscita("Importazione interrotta: oltre 15 minuti.")
    finally:
        _LOCK_IMPORT.release()


def importa_da_file(regione: str, anno: int, dcf: Path) -> dict:
    """Importa un file PriMus (.dcf) caricato dall'interfaccia: lo stesso
    percorso di './spada importa-prezzario <Regione> <anno> file.dcf'.
    primus_dcf.py rifiuta, senza toccare il database, un file che non è
    un PriMus leggibile o che dichiara un anno diverso; dopo l'import lo
    script ne tiene una copia nella cache locale."""
    regione = _valida(regione, anno)
    proc = _esegui_import(regione, anno, str(dcf))
    if proc.returncode != 0:
        raise ImportazioneNonRiuscita((proc.stderr.strip() or proc.stdout.strip())[-600:])
    return {"regione": regione, "anno": int(anno), "importato": True, "edizione": _edizione(regione, int(anno))}


def importa(regione: str, anno: int) -> dict:
    """Importa un'edizione con import_prezzario.sh: cache locale
    (~/.spada/prezzari) o release di prometeus-prezzari via gh. Una sola
    importazione alla volta."""
    regione = _valida(regione, anno)
    proc = _esegui_import(regione, anno)
    if proc.returncode != 0:
        dettaglio = (proc.stderr.strip() or proc.stdout.strip())[-600:]
        if "release not found" in dettaglio.lower() or "no assets" in dettaglio.lower():
            dettaglio = (
                f"In prometeus-prezzari non c'è ancora una release «{regione.lower()}-{int(anno)}»: "
                "il prezzario va prima estratto ed elaborato lì, oppure caricato qui dal file PriMus "
                "(.dcf) pubblicato dalla regione con «Carica file .dcf»."
            )
        raise ImportazioneNonRiuscita(dettaglio)
    return {"regione": regione, "anno": int(anno), "importato": True, "edizione": _edizione(regione, int(anno))}
