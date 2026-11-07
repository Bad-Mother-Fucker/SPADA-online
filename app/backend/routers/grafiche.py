"""Grafiche della relazione tecnica (Fase 7): vedi grafiche.py.

Valgono solo per il deliverable di tipo relazione_tecnica, dopo la
conferma della Fase 6 (prima non ci sono deliverable).
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import grafiche
from auth import AutenticazioneClaudeNonDisponibile
from models import AggiornaGraficaRequest, GraficaRequest, RitaglioRiferimentoRequest
from routers.gare import _deliverable_o_404, _gara_o_404

router = APIRouter(prefix="/gare", tags=["grafiche"])

BASE = "/{slug}/deliverables/{deliverable_id}/grafiche"
FIG_RE = r"^fig-[0-9]{2,4}$"


def _relazione(slug: str, deliverable_id: str):
    d = _gara_o_404(slug)
    dl = _deliverable_o_404(slug, deliverable_id)
    if dl["tipo"] != "relazione_tecnica":
        raise HTTPException(409, "Le figure si aggiungono solo alla relazione tecnica.")
    return d, dl


def _esegui(fn, *args):
    try:
        return fn(*args)
    except grafiche.ErroreGrafica as e:
        raise HTTPException(e.codice, str(e))
    except AutenticazioneClaudeNonDisponibile as e:
        raise HTTPException(409, str(e))


def _id_valido(gid: str):
    import re
    if not re.match(FIG_RE, gid):
        raise HTTPException(404, f"Figura {gid} non trovata.")


@router.get(BASE)
def elenco_grafiche(slug: str, deliverable_id: str):
    d, dl = _relazione(slug, deliverable_id)
    return grafiche.elenco(d, dl)


@router.post(BASE, status_code=201)
def crea_grafica(slug: str, deliverable_id: str, body: GraficaRequest):
    d, dl = _relazione(slug, deliverable_id)
    gid = _esegui(grafiche.crea, d, dl, body.proposta_id, body.richiesta)
    return {"id": gid}


@router.patch(BASE + "/{gid}")
def aggiorna_grafica(slug: str, deliverable_id: str, gid: str, body: AggiornaGraficaRequest):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.aggiorna, d, dl, gid, body.model_dump())
    return {"id": gid}


@router.delete(BASE + "/{gid}", status_code=204)
def elimina_grafica(slug: str, deliverable_id: str, gid: str):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.elimina, d, dl, gid)


@router.post(BASE + "/{gid}/prompt", status_code=202)
def prepara_prompt(slug: str, deliverable_id: str, gid: str, altro_riferimento: bool = False):
    """Claude prepara prompt, didascalia e riferimento in background (2-4
    minuti). altro_riferimento: esclude dalla ricerca quello attuale."""
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.prepara_prompt, d, dl, gid, altro_riferimento)
    return {"id": gid, "operazione": "prompt"}


@router.post(BASE + "/{gid}/genera", status_code=202)
def genera_immagine(slug: str, deliverable_id: str, gid: str):
    """Genera l'immagine con OpenAI in background (serve la chiave)."""
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.genera_immagine, d, dl, gid)
    return {"id": gid, "operazione": "immagine"}


@router.post(BASE + "/{gid}/immagine")
def carica_immagine(slug: str, deliverable_id: str, gid: str, file: UploadFile):
    """Immagine ottenuta fuori da SPADA (ChatGPT) con il prompt della figura."""
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    dati = file.file.read(grafiche.MAX_IMMAGINE + 1)
    _esegui(grafiche.carica, d, dl, gid, dati)
    return {"id": gid}


@router.get(BASE + "/{gid}/immagine")
def leggi_immagine(slug: str, deliverable_id: str, gid: str):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    f = grafiche.file_immagine(d, dl, gid)
    if f is None:
        raise HTTPException(404, "Questa figura non ha ancora un'immagine.")
    # L'URL porta ?v=<data di caricamento>: un'immagine nuova ha un URL nuovo.
    return FileResponse(str(f), headers={"Cache-Control": "no-cache"})


# ── Riferimento: immagine da cui partire, mai nel documento ─────────
@router.get(BASE + "/{gid}/riferimento")
def leggi_riferimento(slug: str, deliverable_id: str, gid: str):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    f = grafiche.file_riferimento(d, dl, gid)
    if f is None:
        raise HTTPException(404, "Questa figura non ha un'immagine di riferimento.")
    return FileResponse(str(f), headers={"Cache-Control": "no-cache"})


@router.get(BASE + "/{gid}/riferimento/pagina")
def pagina_riferimento(slug: str, deliverable_id: str, gid: str):
    """Pagina intera dell'elaborato, per regolare il ritaglio."""
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    f = _esegui(grafiche.pagina_riferimento, d, dl, gid)
    return FileResponse(str(f), media_type="image/png", headers={"Cache-Control": "no-cache"})


@router.put(BASE + "/{gid}/riferimento/ritaglio")
def ritaglia_riferimento(slug: str, deliverable_id: str, gid: str, body: RitaglioRiferimentoRequest):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.ritaglia_riferimento, d, dl, gid, body.riquadro)
    return {"id": gid}


@router.post(BASE + "/{gid}/riferimento")
def carica_riferimento(slug: str, deliverable_id: str, gid: str, file: UploadFile):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.carica_riferimento, d, dl, gid, file.file.read(grafiche.MAX_IMMAGINE + 1))
    return {"id": gid}


@router.delete(BASE + "/{gid}/riferimento", status_code=204)
def togli_riferimento(slug: str, deliverable_id: str, gid: str):
    _id_valido(gid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(grafiche.togli_riferimento, d, dl, gid)
