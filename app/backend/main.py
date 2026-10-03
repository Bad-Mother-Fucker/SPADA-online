"""SPADA — backend FastAPI (Sprint 4), versione locale.

Avvio: `./spada avvia` dalla radice del progetto (uvicorn su
127.0.0.1:8000 + worker.py in un processo separato che consuma la coda
job). Serve anche il frontend statico (app/frontend/) dalla stessa
origine: http://localhost:8000 è l'unico indirizzo da aprire.
"""
import logging
import os
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from db import init_db
from routers import gare, sistema

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("spada.api")

app = FastAPI(title="SPADA API", version="0.1.0")

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"

# In locale frontend e API hanno la stessa origine: CORS non serve. Resta
# attivabile (SPADA_FRONTEND_ORIGIN) solo per servire il frontend da un
# altro indirizzo, es. un server di sviluppo. L'autenticazione che sulla
# VM faceva Cloudflare Access qui la fa l'indirizzo d'ascolto: uvicorn
# risponde solo su 127.0.0.1, cioè da questo computer.
if os.environ.get("SPADA_FRONTEND_ORIGIN"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[os.environ["SPADA_FRONTEND_ORIGIN"]],
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
def _startup():
    init_db()
    log.info("Database inizializzato/verificato.")


app.include_router(gare.router)
app.include_router(sistema.router)


@app.exception_handler(StarletteHTTPException)
async def _http_exception_con_causa_originale(request, exc):
    # FastAPI converte errori interni (es. parsing multipart fallito) in
    # HTTPException con "raise ... from e", ma la causa originale non
    # arriva mai nei log — solo il messaggio generico al client. La si
    # logga qui per poterla leggere in produzione senza dover riprodurre
    # il bug con uno script a parte. Nessun cambio di comportamento verso
    # il client: la risposta resta quella di default di FastAPI.
    if exc.__cause__ is not None:
        log.exception("HTTPException con causa originale", exc_info=exc.__cause__)
    return await http_exception_handler(request, exc)


@app.get("/salute")
def salute():
    return {"servizio": "SPADA API", "stato": "attivo"}


class _FrontendStatico(StaticFiles):
    """File del frontend sempre rivalidati (no-cache, non no-store): dopo
    un aggiornamento del codice il browser prende subito i JS nuovi,
    invece di mescolarli con una versione in cache."""

    async def get_response(self, path, scope):
        risposta = await super().get_response(path, scope)
        risposta.headers["Cache-Control"] = "no-cache"
        return risposta


# Montato per ultimo: le rotte API (/gare, /sistema, /salute) hanno la
# precedenza, tutto il resto è il frontend (index.html su "/").
app.mount("/", _FrontendStatico(directory=str(FRONTEND_DIR), html=True), name="frontend")
