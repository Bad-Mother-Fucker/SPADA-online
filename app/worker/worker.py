#!/usr/bin/env python3
"""worker.py — processo separato dall'API (Sprint 4.2): consuma la
coda `job` in ordine FIFO, un job alla volta (principio 7 del piano),
lanciando `spada-fase`.

Avvio: `./spada avvia` dalla radice del progetto (lo lancia insieme
all'API), oppure a mano `python3 worker.py`.

Ripartenza pulita: all'avvio del worker, un job rimasto "in_esecuzione"
da un processo precedente terminato senza aggiornare lo stato (crash,
kill -9, Mac spento o riavviato) viene rilevato e marcato "errore" — non
viene mai ripreso a metà.

Sul Mac ogni job gira sotto `caffeinate -i`: il sistema non va in stop
per inattività mentre una fase è in corso (chiudere il coperchio di un
portatile lo sospende comunque).
"""
import logging
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from auth import AutenticazioneClaudeNonDisponibile, get_claude_env  # noqa: E402
from db import get_conn, init_db  # noqa: E402
from paths import PIPELINE_DIR  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s worker %(message)s")
log = logging.getLogger("spada.worker")

POLL_SECONDS = 3
TIMEOUT_JOB_SECONDI = 2 * 60 * 60
# Su macOS impedisce lo stop per inattività finché il job è vivo; altrove
# (o se manca) il job parte uguale, senza.
CAFFEINATE = ["caffeinate", "-i"] if sys.platform == "darwin" and shutil.which("caffeinate") else []

# Il job gira in un proprio gruppo di processi (caffeinate → bash →
# claude → subagenti): al timeout o all'arresto del worker si termina
# l'intero gruppo, non solo il primo processo — l'equivalente locale di
# KillMode=mixed nell'unit systemd della VM.
_job_corrente: subprocess.Popen | None = None


def _termina_gruppo(proc: subprocess.Popen):
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    except ProcessLookupError:
        return
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def _arresto(signum, _frame):
    if _job_corrente is not None and _job_corrente.poll() is None:
        log.warning("Arresto del worker: termino il job in corso (resterà marcato errore al prossimo avvio).")
        _termina_gruppo(_job_corrente)
    sys.exit(0)


def now():
    return datetime.now(timezone.utc).isoformat()


def pulisci_job_orfani():
    """Un job 'in_esecuzione' senza un processo worker vivo dietro
    (riavvio, crash) va marcato errore: mai ripreso automaticamente a
    metà, l'operatore rilancia esplicitamente la fase."""
    with get_conn() as con:
        orfani = con.execute("SELECT id FROM job WHERE stato='in_esecuzione'").fetchall()
        for o in orfani:
            log.warning("Job %s trovato in_esecuzione all'avvio del worker: marcato errore (ripartenza pulita).", o["id"])
            con.execute(
                "UPDATE job SET stato='errore', errore=?, concluso_il=? WHERE id=?",
                ("Worker riavviato con il job ancora in_esecuzione: nessuna ripresa automatica.", now(), o["id"]),
            )


def prossimo_job():
    with get_conn() as con:
        return con.execute(
            "SELECT * FROM job WHERE stato='in_coda' ORDER BY creato_il ASC LIMIT 1"
        ).fetchone()


def c_e_un_job_in_esecuzione() -> bool:
    with get_conn() as con:
        return con.execute("SELECT 1 FROM job WHERE stato='in_esecuzione' LIMIT 1").fetchone() is not None


def esegui_job(job):
    job_id = job["id"]
    slug, fase, tipo = job["gara_slug"], job["fase"], job["tipo"]
    deliverable_id = job["deliverable_id"]

    with get_conn() as con:
        con.execute(
            "UPDATE job SET stato='in_esecuzione', iniziato_il=? WHERE id=?",
            (now(), job_id),
        )

    try:
        env_claude = get_claude_env()
    except AutenticazioneClaudeNonDisponibile as e:
        with get_conn() as con:
            con.execute(
                "UPDATE job SET stato='errore', errore=?, concluso_il=? WHERE id=?",
                (str(e), now(), job_id),
            )
        log.error("Job %s: autenticazione Claude non disponibile: %s", job_id, e)
        return

    operazione = job["operazione"] if "operazione" in job.keys() else None
    if operazione:
        # Integrazione fuori fase: documento caricato dopo la Fase 2 o
        # riallineamento del brief. Non tocca lo stato delle fasi.
        spada_integra = PIPELINE_DIR / "scripts" / "setup" / "spada_integra.sh"
        if operazione == "integra_documento":
            argv = ["bash", str(spada_integra), slug, "documento", job["argomento"] or ""]
        else:
            argv = ["bash", str(spada_integra), slug, "brief"]
    elif deliverable_id:
        # Sprint 10.3: un deliverable si esegue da solo, indipendente
        # dagli altri deliverable della stessa gara e dalle altre fasi.
        spada_deliverable = PIPELINE_DIR / "scripts" / "setup" / "spada_deliverable.sh"
        argv = ["bash", str(spada_deliverable), slug, deliverable_id]
        if tipo == "riesegui":
            argv.append("--riesegui")
    else:
        spada_fase = PIPELINE_DIR / "scripts" / "setup" / "spada_fase.sh"
        argv = ["bash", str(spada_fase), slug, str(fase)]
        if tipo == "riesegui":
            argv.append("--riesegui")
        elif tipo == "approva":
            argv.append("--approva")

    log.info("Job %s: eseguo %s", job_id, " ".join(argv))
    env = {**os.environ, **env_claude}
    global _job_corrente
    proc = subprocess.Popen(CAFFEINATE + argv, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, start_new_session=True)
    _job_corrente = proc
    try:
        stdout, stderr = proc.communicate(timeout=TIMEOUT_JOB_SECONDI)
        stato_finale = "completato" if proc.returncode == 0 else "errore"
        errore = None if proc.returncode == 0 else (stderr[-2000:] or stdout[-2000:])
    except subprocess.TimeoutExpired:
        # Senza questo il worker morirebbe con il job ancora
        # "in_esecuzione": in locale nessun systemd lo riavvia.
        _termina_gruppo(proc)
        stato_finale = "errore"
        errore = f"Job interrotto: superato il limite di {TIMEOUT_JOB_SECONDI // 60} minuti."
    finally:
        _job_corrente = None

    with get_conn() as con:
        con.execute(
            "UPDATE job SET stato=?, errore=?, concluso_il=? WHERE id=?",
            (stato_finale, errore, now(), job_id),
        )
    log.info("Job %s: %s", job_id, stato_finale)


def loop():
    signal.signal(signal.SIGTERM, _arresto)
    signal.signal(signal.SIGINT, _arresto)
    init_db()
    pulisci_job_orfani()
    log.info("Worker avviato. Polling ogni %ss.", POLL_SECONDS)
    while True:
        if not c_e_un_job_in_esecuzione():
            job = prossimo_job()
            if job:
                esegui_job(job)
                continue  # ricontrolla subito se c'e' altro in coda
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    loop()
