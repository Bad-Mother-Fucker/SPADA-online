"""SPADA Online — backend FastAPI (Sprint 4).

Avvio locale/dev:
  uvicorn main:app --reload --port 8000

In produzione (Sprint 9): systemd, dietro Cloudflare Tunnel, separato
dal processo worker (worker.py) che consuma la coda job.
"""
import logging
import os
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routers import gare, sistema

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("spada.api")

app = FastAPI(title="SPADA Online API", version="0.1.0")

# Frontend (Cloudflare Pages) e backend (Cloudflare Tunnel) sono origini
# diverse per costruzione (Sprint 9). Un solo operatore autorizzato passa
# comunque da Cloudflare Access davanti a entrambe: qui basta abilitare il
# fetch cross-origin, non serve un secondo livello di autenticazione.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("SPADA_FRONTEND_ORIGIN", "*")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()
    log.info("Database inizializzato/verificato.")


app.include_router(gare.router)
app.include_router(sistema.router)


@app.get("/")
def radice():
    return {"servizio": "SPADA Online API", "stato": "attivo"}
