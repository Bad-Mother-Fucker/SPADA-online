#!/usr/bin/env python3
"""worker.py — processo separato dall'API (Sprint 4.2): consuma la
coda `job` in ordine FIFO, un job alla volta (principio 7 del piano),
lanciando `spada-fase`.

Avvio: `./spada avvia` dalla radice del progetto (lo lancia insieme
all'API), oppure a mano `python3 worker.py`.

Ripartenza pulita: all'avvio del worker, un job rimasto "in_esecuzione"
da un processo precedente terminato senza aggiornare lo stato (crash,
kill -9, Mac spento o riavviato) viene rilevato e marcato "errore" — non
viene mai ripreso a metà automaticamente.

Interruzione: «Interrompi» dall'interfaccia (o l'arresto del worker)
termina il gruppo del job con SIGTERM; lo script di fase/deliverable lo
registra "interrotta" con la sessione di Claude, e rieseguirla la
riprende da dove si era fermata (spada_comune.sh, sessione_interrotta).

Sul Mac ogni job gira sotto `caffeinate -i`: il sistema non va in stop
per inattività mentre una fase è in corso (chiudere il coperchio di un
portatile lo sospende comunque).
"""
import json
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
from paths import GARE_DIR, PIPELINE_DIR  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s worker %(message)s")
log = logging.getLogger("spada.worker")

POLL_SECONDS = 3
TIMEOUT_JOB_SECONDI = 2 * 60 * 60
CONTROLLO_INTERRUZIONE_SECONDI = 2
# Dopo SIGTERM claude salva la sessione e lo script registra
# l'interruzione: il tempo per farlo, poi SIGKILL.
ATTESA_CHIUSURA_SECONDI = 20
MSG_INTERROTTO = "Interrotta su richiesta: rieseguendola riprende da dove si era fermata."
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
    except ProcessLookupError:
        return
    # Si aspetta il gruppo, non solo il primo processo: con caffeinate
    # davanti (macOS) lo script di fase sta ancora registrando l'esito.
    scadenza = time.monotonic() + ATTESA_CHIUSURA_SECONDI
    while time.monotonic() < scadenza:
        proc.poll()  # raccoglie il primo processo: da zombie terrebbe vivo il gruppo
        try:
            os.killpg(proc.pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.2)
    else:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


def _arresto(signum, _frame):
    if _job_corrente is not None and _job_corrente.poll() is None:
        log.warning("Arresto del worker: interrompo il job in corso (riprende alla prossima esecuzione).")
        _termina_gruppo(_job_corrente)
        with get_conn() as con:
            con.execute(
                "UPDATE job SET stato='annullato', interruzione_richiesta=0, errore=?, concluso_il=? "
                "WHERE stato='in_esecuzione'",
                ("SPADA è stato fermato durante l'esecuzione: rieseguendola riprende da dove si era fermata.", now()),
            )
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
                "UPDATE job SET stato='errore', interruzione_richiesta=0, errore=?, concluso_il=? WHERE id=?",
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


def registra_errore_prima_dell_avvio(job, messaggio: str):
    """Un job scartato prima di lanciare lo script (es. Claude non
    autenticato) non tocca mai _state/: senza questo la fase resterebbe
    «da eseguire» e l'errore visibile solo nella tabella job. Si scrive
    come lo scriverebbe spada_fase.sh: fase in errore e una riga nel
    run_log con la causa, che l'interfaccia mostra in «Perché è fallita»."""
    if job["deliverable_id"] or ("operazione" in job.keys() and job["operazione"]):
        return  # deliverable e integrazioni hanno il proprio stato
    stato_dir = GARE_DIR / job["gara_slug"] / "_state"
    adesso = now()
    try:
        fasi_p = stato_dir / "fasi.json"
        fasi = json.loads(fasi_p.read_text(encoding="utf-8"))
        chiave = next((k for k in fasi.get("fasi", {}) if k.startswith(f"{job['fase']}_")), None)
        if chiave:
            fasi["fasi"][chiave].update(stato="errore", conclusa_il=adesso)
            fasi_p.write_text(json.dumps(fasi, ensure_ascii=False, indent=2), encoding="utf-8")
        log_p = stato_dir / "run_log.json"
        run_log = json.loads(log_p.read_text(encoding="utf-8")) if log_p.exists() else {"runs": []}
        run_log.setdefault("runs", []).append({
            "run_id": f"job-{job['id']}", "fase": job["fase"], "riesecuzione": job["tipo"] == "riesegui",
            "avviato_il": adesso, "concluso_il": adesso, "pipeline_version": "n/a (non avviata)",
            "prezzario_version": None, "modello": "n/a", "effort": "n/a",
            "esito": "errore", "errore": f"Fase non avviata: {messaggio}",
        })
        log_p.write_text(json.dumps(run_log, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        log.exception("Job %s: errore non registrato nello stato della gara", job["id"])


def chiudi_stato_appeso(job):
    """Dopo un'interruzione lo stato lo scrive lo script (trap su SIGTERM).
    Se il segnale è arrivato prima che lo script lanciasse claude, la fase
    o il deliverable resterebbero «in_esecuzione» per sempre: si segnano
    «interrotta». Senza una sessione salvata, rieseguirla riparte da capo."""
    if "operazione" in job.keys() and job["operazione"]:
        return
    stato_dir = GARE_DIR / job["gara_slug"] / "_state"
    try:
        if job["deliverable_id"]:
            p = stato_dir / "deliverables.json"
            dati = json.loads(p.read_text(encoding="utf-8"))
            corpo = dati.get(job["deliverable_id"])
        else:
            p = stato_dir / "fasi.json"
            dati = json.loads(p.read_text(encoding="utf-8"))
            corpo = next((v for k, v in dati.get("fasi", {}).items() if k.startswith(f"{job['fase']}_")), None)
        if corpo and corpo.get("stato") == "in_esecuzione":
            corpo.update(stato="interrotta", conclusa_il=now())
            p.write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError):
        log.exception("Job %s: stato dopo l'interruzione non verificato", job["id"])


def _interruzione_richiesta(job_id: int) -> bool:
    with get_conn() as con:
        riga = con.execute("SELECT interruzione_richiesta FROM job WHERE id=?", (job_id,)).fetchone()
    return bool(riga and riga["interruzione_richiesta"])


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
        registra_errore_prima_dell_avvio(job, str(e))
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
    # communicate() a intervalli brevi: fra un intervallo e l'altro si
    # guarda se è stata chiesta l'interruzione. Ripetere communicate() dopo
    # un TimeoutExpired non perde output (documentato in subprocess).
    avvio = time.monotonic()
    try:
        while True:
            try:
                stdout, stderr = proc.communicate(timeout=CONTROLLO_INTERRUZIONE_SECONDI)
                break
            except subprocess.TimeoutExpired:
                if _interruzione_richiesta(job_id):
                    log.info("Job %s: interruzione richiesta", job_id)
                    _termina_gruppo(proc)
                    try:
                        proc.communicate(timeout=5)
                    except subprocess.TimeoutExpired:
                        pass
                    break
                if time.monotonic() - avvio > TIMEOUT_JOB_SECONDI:
                    raise
        if _interruzione_richiesta(job_id):
            stato_finale, errore = "annullato", MSG_INTERROTTO
            chiudi_stato_appeso(job)
        else:
            stato_finale = "completato" if proc.returncode == 0 else "errore"
            errore = None if proc.returncode == 0 else (stderr[-2000:] or stdout[-2000:])
    except subprocess.TimeoutExpired:
        # Senza questo il worker morirebbe con il job ancora
        # "in_esecuzione": in locale nessun systemd lo riavvia.
        _termina_gruppo(proc)
        stato_finale = "errore"
        errore = (f"Job interrotto: superato il limite di {TIMEOUT_JOB_SECONDI // 60} minuti. "
                  "Rieseguendolo riprende da dove si era fermato.")
    finally:
        _job_corrente = None

    with get_conn() as con:
        con.execute(
            "UPDATE job SET stato=?, interruzione_richiesta=0, errore=?, concluso_il=? WHERE id=?",
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
