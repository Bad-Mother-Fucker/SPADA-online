import sqlite3
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auth import stato_autenticazione
from models import ImportaPrezzarioRequest
from paths import DATA_DIR, DB_PATH, PIPELINE_DIR
from prezzario import ImportazioneNonRiuscita, importa

router = APIRouter(prefix="/sistema", tags=["sistema"])


@router.get("/design-system.css")
def design_system_css():
    """Serve il design system unico (Sprint 5) al frontend statico.
    Fonte unica: _pipeline/design/design-system.css, pubblicata in
    _data/ da link_pipeline.sh."""
    path = DATA_DIR / "design-system.css"
    if not path.exists():
        path = PIPELINE_DIR / "design" / "design-system.css"
    if not path.exists():
        raise HTTPException(404, "design-system.css non trovato (link_pipeline.sh non ancora eseguito?)")
    # no-cache (non no-store): il browser rivalida sempre con l'ETag — il
    # file cambia raramente ma quando cambia deve arrivare subito.
    return FileResponse(str(path), media_type="text/css", headers={"Cache-Control": "no-cache"})


@router.get("/auth")
def auth():
    return stato_autenticazione()


@router.get("/prezzari")
def prezzari():
    if not DB_PATH.exists():
        return []
    con = sqlite3.connect(str(DB_PATH))
    try:
        righe = con.execute(
            "SELECT regione, anno, importato_il, totale_voci_articoli FROM prezzario_versioni "
            "ORDER BY regione, anno"
        ).fetchall()
    except sqlite3.OperationalError:
        return []  # tabella non ancora creata (nessun import Sprint 2 eseguito)
    finally:
        con.close()
    return [
        {"regione": r[0], "anno": r[1], "importato_il": r[2], "totale_voci": r[3]}
        for r in righe
    ]


@router.post("/prezzari/importa")
def importa_prezzario(body: ImportaPrezzarioRequest):
    """Importa un'edizione mancante dal pannello della gara: cache locale
    o release di prometeus-prezzari (vedi prezzario.importa). Sincrono:
    di solito pochi secondi, al massimo il download della release."""
    try:
        return importa(body.regione, body.anno)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except ImportazioneNonRiuscita as e:
        raise HTTPException(502, f"Importazione non riuscita: {e}")


@router.get("/pipeline")
def pipeline():
    version_file = PIPELINE_DIR / "VERSION"
    versione = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else "sconosciuta"
    git_ref = subprocess.run(
        ["git", "-C", str(PIPELINE_DIR), "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True,
    ).stdout.strip() or "n.d."
    return {"versione": versione, "git_ref": git_ref}
