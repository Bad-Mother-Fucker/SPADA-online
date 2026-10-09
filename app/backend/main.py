"""SPADA — backend FastAPI (Sprint 4), versione locale.

Avvio: `./spada avvia` dalla radice del progetto (uvicorn su
127.0.0.1:8000 + worker.py in un processo separato che consuma la coda
job). Serve anche l'interfaccia web (app/web/dist, compilata da Vite)
dalla stessa origine: http://localhost:8000 è l'unico indirizzo da aprire.
"""
import logging
import os
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from db import init_db
from paths import SlugNonValido
from routers import gare, sistema

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("spada.api")

app = FastAPI(title="SPADA API", version="0.1.0")

# L'interfaccia web è la build di Vite in app/web/dist (la produce
# ./spada setup); FastAPI la serve su "/" accanto alle API.
APP_DIR = Path(__file__).resolve().parents[1]
WEB_DIST_DIR = APP_DIR / "web" / "dist"

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
    # Gare create con le sette fasi → otto fasi con la Fase 4 «Domande al
    # professionista». Una volta sola per gara (versione_fasi in fasi.json).
    from migrazioni import migra_gare
    migra_gare()


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


@app.exception_handler(SlugNonValido)
async def _percorso_non_valido(request, exc):
    # Slug o percorso fuori dalla gara (es. "../" in /output/{percorso}):
    # richiesta rifiutata, non un errore interno.
    return JSONResponse(status_code=400, content={"detail": str(exc)})


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


@app.get("/gara.html", include_in_schema=False)
def _pagina_gara_precedente(slug: str = ""):
    """I segnalibri salvati a /gara.html?slug=… aprono la nuova pagina
    gara; il browser conserva il frammento #/fase/N, che la pagina
    converte nel suo percorso."""
    return RedirectResponse(f"/gara/{slug}" if slug else "/", status_code=307)


@app.get("/gara/{resto:path}", include_in_schema=False)
def _pagina_gara(resto: str):
    """La nuova interfaccia gestisce da sé i percorsi /gara/…: a un
    ricaricamento FastAPI serve la pagina e lascia il resto al router."""
    indice = WEB_DIST_DIR / "index.html"
    if indice.exists():
        return FileResponse(str(indice), headers={"Cache-Control": "no-cache"})
    return RedirectResponse("/", status_code=307)


# Montato per ultimo: le rotte API (/gare, /sistema, /salute) hanno la
# precedenza. Se la build manca (setup non rieseguito) una pagina minima
# dice cosa fare, invece di un 404 muto.
if (WEB_DIST_DIR / "index.html").exists():
    app.mount("/", _FrontendStatico(directory=str(WEB_DIST_DIR), html=True), name="frontend")
else:
    log.warning("Interfaccia web non compilata (%s): esegui ./spada setup.", WEB_DIST_DIR)

    @app.get("/", include_in_schema=False)
    def _interfaccia_mancante():
        return HTMLResponse(
            "<!doctype html><meta charset='utf-8'><title>SPADA</title>"
            "<p style='font:15px system-ui;margin:3rem'>Interfaccia web non compilata: "
            "esegui <code>./spada setup</code> e riavvia il server.</p>", status_code=503)
