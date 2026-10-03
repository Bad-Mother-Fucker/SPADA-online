"""Livello di autenticazione Claude astratto (Sprint 4.3, principio 10
del piano): l'esecutore (worker) non deve conoscere il METODO di
autenticazione, solo che questa funzione gli dà un ambiente pronto per
lanciare `spada-fase`.

Versione locale: ogni `claude` della pipeline gira con una directory di
configurazione dedicata (CLAUDE_CONFIG_DIR = ~/spada/_claude, vedi
_pipeline/scripts/setup/spada_claude.sh), separata da ~/.claude
dell'operatore. Due modi di autenticarla, nell'ordine:

1. CLAUDE_CODE_OAUTH_TOKEN (da `claude setup-token`), in ambiente o in
   ~/spada/_data/auth.env — l'equivalente di /etc/spada/auth.env sulla VM;
2. login della config dedicata con `./spada login`, verificato con
   `claude auth status`.

Mai ANTHROPIC_API_KEY: spada_claude.sh la rimuove dall'ambiente, così
una chiave rimasta nella shell non sposta i costi dalla subscription al
consumo.
"""
import json
import os
import subprocess
import time
from pathlib import Path

from paths import CLAUDE_DIR, DATA_DIR


class AutenticazioneClaudeNonDisponibile(RuntimeError):
    pass


AUTH_ENV_PATH = DATA_DIR / "auth.env"
VALIDITA_TOKEN_GIORNI = 365  # dichiarata dal piano; non c'è un modo verificato
                              # di leggere la scadenza esatta senza `claude /status`

# `claude auth status` costa un processo node (~1s): il risultato si
# riusa per qualche secondo, abbastanza per le richieste ravvicinate
# del frontend, mai per nascondere un logout.
_CACHE_SECONDI = 30
_cache_login: tuple[float, dict] | None = None


def _token_configurato() -> str | None:
    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if token:
        return token
    if AUTH_ENV_PATH.exists():
        for line in AUTH_ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("CLAUDE_CODE_OAUTH_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"') or None
    return None


def _stato_login() -> dict:
    """Esito di `claude auth status --json` sulla config dedicata."""
    global _cache_login
    if _cache_login and time.monotonic() - _cache_login[0] < _CACHE_SECONDI:
        return _cache_login[1]
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    env["CLAUDE_CONFIG_DIR"] = str(CLAUDE_DIR)
    try:
        proc = subprocess.run(
            ["claude", "auth", "status", "--json"],
            env=env, capture_output=True, text=True, timeout=30,
        )
        stato = json.loads(proc.stdout or "{}")
    except FileNotFoundError:
        stato = {"loggedIn": False, "errore": "comando `claude` non trovato nel PATH"}
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        stato = {"loggedIn": False, "errore": f"`claude auth status` non leggibile: {e}"}
    _cache_login = (time.monotonic(), stato)
    return stato


def get_claude_env() -> dict:
    """Ritorna le variabili d'ambiente da iniettare nel subprocess che
    lancia `claude` (via spada_claude.sh). Solleva se non c'è nulla di
    utilizzabile — il worker deve fallire il job in modo esplicito,
    mai procedere senza autenticazione."""
    env = {"CLAUDE_CONFIG_DIR": str(CLAUDE_DIR)}
    token = _token_configurato()
    if token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = token
        return env

    stato = _stato_login()
    if stato.get("loggedIn"):
        return env

    dettaglio = stato.get("errore") or "la configurazione dedicata di SPADA non ha un login attivo"
    raise AutenticazioneClaudeNonDisponibile(
        f"Claude non autenticato per SPADA ({dettaglio}). "
        "Esegui './spada login' nella cartella dell'app."
    )


def stato_autenticazione() -> dict:
    """Per GET /sistema/auth — non solleva mai, riporta lo stato.

    `stima_scadenza` esiste solo col token di `claude setup-token`
    (validità ~1 anno): è una STIMA dall'mtime di auth.env, non letta
    dal token. Col login della config dedicata il rinnovo lo gestisce
    Claude Code da sé e non c'è nulla da stimare."""
    stima = None
    if AUTH_ENV_PATH.exists() and not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        eta_giorni = (time.time() - AUTH_ENV_PATH.stat().st_mtime) / 86400
        stima = {
            "generato_circa_il": None,  # non ricostruibile dall'mtime da solo con precisione affidabile
            "giorni_dalla_modifica_file": round(eta_giorni),
            "giorni_alla_scadenza_stimata": round(VALIDITA_TOKEN_GIORNI - eta_giorni),
            "nota": f"Stima da mtime di {AUTH_ENV_PATH}, non dal token.",
        }

    try:
        env = get_claude_env()
        metodo = "oauth_token" if "CLAUDE_CODE_OAUTH_TOKEN" in env else "login_config_dedicata"
        return {"disponibile": True, "metodo": metodo, "stima_scadenza": stima}
    except AutenticazioneClaudeNonDisponibile as e:
        return {"disponibile": False, "motivo": str(e), "stima_scadenza": stima}
