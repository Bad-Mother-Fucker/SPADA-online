"""Connessione SQLite condivisa con Sprint 2 (prezzario_*) — Sprint 4
aggiunge le tabelle applicative da schema_app.sql allo stesso spada.db.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from paths import DB_PATH

SCHEMA_APP = Path(__file__).parent / "schema_app.sql"


def _applica_migrazioni(con: sqlite3.Connection):
    """CREATE TABLE IF NOT EXISTS non altera una tabella già esistente:
    una colonna aggiunta in una versione successiva dello schema (es.
    job.deliverable_id, Sprint 10.3) va aggiunta esplicitamente sui
    database di produzione che l'hanno creata prima. Idempotente."""
    colonne_job = {r[1] for r in con.execute("PRAGMA table_info(job)")}
    if "deliverable_id" not in colonne_job:
        con.execute("ALTER TABLE job ADD COLUMN deliverable_id TEXT")


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    try:
        con.executescript(SCHEMA_APP.read_text(encoding="utf-8"))
        _applica_migrazioni(con)
        con.commit()
    finally:
        con.close()


@contextmanager
def get_conn():
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    finally:
        con.close()
