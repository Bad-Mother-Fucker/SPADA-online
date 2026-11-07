"""Schede tecniche della relazione tecnica (Fase 7): vedi schede.py.

Valgono solo per il deliverable di tipo relazione_tecnica, dopo la
conferma della Fase 6 (prima non ci sono deliverable).
"""
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import schede
from auth import AutenticazioneClaudeNonDisponibile
from models import AggiornaSchedaRequest, ConsegnaSchedeRequest, SchedaRequest, UsaCandidatoRequest
from routers.gare import _deliverable_o_404, _gara_o_404

router = APIRouter(prefix="/gare", tags=["schede"])

BASE = "/{slug}/deliverables/{deliverable_id}/schede"
SCH_RE = r"^sch-[0-9]{2,4}$"


def _relazione(slug: str, deliverable_id: str):
    d = _gara_o_404(slug)
    dl = _deliverable_o_404(slug, deliverable_id)
    if dl["tipo"] != "relazione_tecnica":
        raise HTTPException(409, "Le schede tecniche si allegano solo alla relazione tecnica.")
    return d, dl


def _esegui(fn, *args):
    try:
        return fn(*args)
    except schede.ErroreScheda as e:
        raise HTTPException(e.codice, str(e))
    except AutenticazioneClaudeNonDisponibile as e:
        raise HTTPException(409, str(e))


def _id_valido(sid: str):
    if not re.match(SCH_RE, sid):
        raise HTTPException(404, f"Scheda {sid} non trovata.")


@router.get(BASE)
def elenco_schede(slug: str, deliverable_id: str):
    d, dl = _relazione(slug, deliverable_id)
    return schede.elenco(d, dl)


@router.post(BASE + "/proponi", status_code=202)
def proponi_schede(slug: str, deliverable_id: str):
    """Claude elenca i documenti di prodotto possibili, in background (qualche minuto)."""
    d, dl = _relazione(slug, deliverable_id)
    _esegui(schede.proponi, d, dl)
    return {"operazione": "proponi"}


@router.put(BASE + "/consegna")
def imposta_consegna(slug: str, deliverable_id: str, body: ConsegnaSchedeRequest):
    d, dl = _relazione(slug, deliverable_id)
    _esegui(schede.imposta_consegna, d, dl, body.consegna)
    return {"consegna": body.consegna}


@router.post(BASE, status_code=201)
def crea_scheda(slug: str, deliverable_id: str, body: SchedaRequest):
    d, dl = _relazione(slug, deliverable_id)
    sid = _esegui(schede.crea, d, dl, body.proposta_id, body.oggetto, body.tipo, body.documenta or "")
    return {"id": sid}


@router.patch(BASE + "/{sid}")
def aggiorna_scheda(slug: str, deliverable_id: str, sid: str, body: AggiornaSchedaRequest):
    _id_valido(sid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(schede.aggiorna, d, dl, sid, body.model_dump())
    return {"id": sid}


@router.delete(BASE + "/{sid}", status_code=204)
def elimina_scheda(slug: str, deliverable_id: str, sid: str):
    _id_valido(sid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(schede.elimina, d, dl, sid)


@router.post(BASE + "/{sid}/cerca", status_code=202)
def cerca_scheda(slug: str, deliverable_id: str, sid: str):
    """Claude cerca il documento sul sito del produttore, in background."""
    _id_valido(sid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(schede.cerca, d, dl, sid)
    return {"id": sid, "operazione": "cerca"}


@router.post(BASE + "/{sid}/usa")
def usa_candidato(slug: str, deliverable_id: str, sid: str, body: UsaCandidatoRequest):
    """Scarica il PDF del prodotto scelto fra quelli trovati online."""
    _id_valido(sid)
    d, dl = _relazione(slug, deliverable_id)
    _esegui(schede.usa_candidato, d, dl, sid, body.indice)
    return {"id": sid}


@router.post(BASE + "/{sid}/file")
def carica_file(slug: str, deliverable_id: str, sid: str, file: UploadFile):
    _id_valido(sid)
    d, dl = _relazione(slug, deliverable_id)
    dati = file.file.read(schede.MAX_PDF + 1)
    _esegui(schede.carica, d, dl, sid, dati, file.filename or "")
    return {"id": sid}


@router.get(BASE + "/{sid}/file")
def leggi_file(slug: str, deliverable_id: str, sid: str):
    _id_valido(sid)
    d, dl = _relazione(slug, deliverable_id)
    f = schede.file_pdf(d, dl, sid)
    if f is None:
        raise HTTPException(404, "Questa scheda non ha ancora un PDF.")
    return FileResponse(str(f), media_type="application/pdf", headers={"Cache-Control": "no-cache"})
