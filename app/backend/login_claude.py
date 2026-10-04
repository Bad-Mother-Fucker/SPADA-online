"""Login di Claude per SPADA dall'interfaccia, al posto di `./spada login`.

Avvia `claude auth login --claudeai` sulla configurazione dedicata
(CLAUDE_CONFIG_DIR = ~/spada/_claude, mai ~/.claude) come processo
figlio del backend. Claude apre da sé il browser del Mac sulla pagina di
accesso; se il ritorno automatico non funziona, la pagina mostra un
codice che si incolla nell'interfaccia e che qui si scrive sullo stdin
del processo («Paste code here if prompted»). Un solo login alla volta.
"""
import os
import re
import subprocess
import threading
import time

import auth
from paths import CLAUDE_DIR

RE_URL = re.compile(r"https://\S+oauth\S+")
_lock = threading.Lock()
_stato: dict = {"proc": None, "url": None, "righe": [], "avviato": 0.0, "codice_inviato": False}
TIMEOUT_SECONDI = 15 * 60


def _env():
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    env["CLAUDE_CONFIG_DIR"] = str(CLAUDE_DIR)
    return env


def _leggi_output(proc):
    for riga in iter(proc.stdout.readline, ""):
        with _lock:
            _stato["righe"].append(riga.rstrip())
            _stato["righe"] = _stato["righe"][-40:]
            m = RE_URL.search(riga)
            if m and not _stato["url"]:
                _stato["url"] = m.group(0)


def _invalida_cache():
    auth._cache_login = None


def avvia() -> dict:
    with _lock:
        p = _stato["proc"]
        if p is not None and p.poll() is None and time.monotonic() - _stato["avviato"] < TIMEOUT_SECONDI:
            return _vista()
        if p is not None and p.poll() is None:
            p.kill()
        proc = subprocess.Popen(
            ["claude", "auth", "login", "--claudeai"], env=_env(),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, start_new_session=True,
        )
        _stato.update(proc=proc, url=None, righe=[], avviato=time.monotonic(), codice_inviato=False)
    threading.Thread(target=_leggi_output, args=(proc,), daemon=True).start()
    # Il link arriva in meno di un secondo: lo si aspetta un poco, così la
    # prima risposta lo contiene già.
    for _ in range(40):
        with _lock:
            if _stato["url"] or proc.poll() is not None:
                break
        time.sleep(0.1)
    _invalida_cache()
    with _lock:
        return _vista()


def invia_codice(codice: str) -> dict:
    codice = (codice or "").strip()
    if not codice:
        raise ValueError("Codice vuoto.")
    with _lock:
        p = _stato["proc"]
        if p is None or p.poll() is not None:
            raise ValueError("Nessun accesso in corso: avvialo di nuovo.")
        p.stdin.write(codice + "\n")
        p.stdin.flush()
        _stato["codice_inviato"] = True
    # Lo scambio del codice dura un paio di secondi.
    for _ in range(100):
        if p.poll() is not None:
            break
        time.sleep(0.1)
    _invalida_cache()
    with _lock:
        return _vista()


def annulla() -> dict:
    with _lock:
        p = _stato["proc"]
        if p is not None and p.poll() is None:
            p.kill()
        _stato.update(proc=None, url=None, righe=[], codice_inviato=False)
        return _vista()


def esci() -> dict:
    annulla()
    subprocess.run(["claude", "auth", "logout"], env=_env(), capture_output=True, text=True, timeout=30)
    _invalida_cache()
    return stato()


def _vista() -> dict:
    p = _stato["proc"]
    if p is None:
        fase = "inattivo"
    elif p.poll() is None:
        fase = "in_attesa"
    else:
        fase = "concluso" if p.returncode == 0 else "fallito"
    return {"fase": fase, "url": _stato["url"], "codice_inviato": _stato["codice_inviato"],
            "messaggio": next((r for r in reversed(_stato["righe"]) if r.strip() and "Paste code" not in r), "")}


def stato() -> dict:
    """Stato dell'autenticazione e dell'eventuale login in corso. Quando il
    processo di login è finito, la cache di `claude auth status` si
    svuota: l'interfaccia vede subito il collegamento."""
    with _lock:
        vista = _vista()
    if vista["fase"] in ("concluso", "fallito"):
        _invalida_cache()
    base = auth.stato_autenticazione()
    dettaglio = auth._stato_login() if base.get("metodo") != "oauth_token" else {}
    return {**base, "account": dettaglio.get("email"), "abbonamento": dettaglio.get("subscriptionType"),
            "login": vista}
