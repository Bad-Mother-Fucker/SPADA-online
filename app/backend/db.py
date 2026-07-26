"""Connessione SQLite condivisa con Sprint 2 (prezzario_*) — Sprint 4
aggiunge le tabelle applicative da schema_app.sql allo stesso spada.db.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from paths import DB_PATH

SCHEMA_APP = Path(__file__).parent / "schema_app.sql"


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    try:
        con.executescript(SCHEMA_APP.read_text(encoding="utf-8"))
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
