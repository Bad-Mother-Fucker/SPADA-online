"""Livello di autenticazione Claude astratto (Sprint 4.3, principio 10
del piano): l'esecutore (worker) non deve conoscere il METODO di
autenticazione, solo che questa funzione gli dà un ambiente pronto per
lanciare `spada-fase`.

Oggi: token OAuth da variabile d'ambiente / file (subscription unica,
Sprint 0). Domani: API key per utente, senza toccare worker.py né
spada_fase.sh — si cambia solo `get_claude_env()`.
"""
import os
from pathlib import Path


class AutenticazioneClaudeNonDisponibile(RuntimeError):
    pass


AUTH_ENV_PATH = Path("/etc/spada/auth.env")
VALIDITA_TOKEN_GIORNI = 365  # dichiarata dal piano; non c'è un modo verificato
                              # di leggere la scadenza esatta senza `claude /status`


def get_claude_env() -> dict:
    """Ritorna le variabili d'ambiente da iniettare nel subprocess che
    lancia `claude` (via spada-fase). Solleva se non c'è nulla di
    utilizzabile — il worker deve fallire il job in modo esplicito,
    mai procedere senza autenticazione."""
    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if not token:
        if AUTH_ENV_PATH.exists():
            for line in AUTH_ENV_PATH.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("CLAUDE_CODE_OAUTH_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"')
                    break

    if not token:
        raise AutenticazioneClaudeNonDisponibile(
            "Nessun CLAUDE_CODE_OAUTH_TOKEN disponibile (né in ambiente né in "
            "/etc/spada/auth.env). Verificare 'claude /status' sulla VM."
        )

    if os.environ.get("ANTHROPIC_API_KEY"):
        raise AutenticazioneClaudeNonDisponibile(
            "ANTHROPIC_API_KEY presente nell'ambiente: il piano richiede la sola "
            "subscription via CLAUDE_CODE_OAUTH_TOKEN (Sprint 9, verifica finale). "
            "Rimuoverla prima di eseguire fasi."
        )

    return {"CLAUDE_CODE_OAUTH_TOKEN": token}


def stato_autenticazione() -> dict:
    """Per GET /sistema/auth — non solleva mai, riporta lo stato.

    `giorni_alla_scadenza_stimata` è una STIMA basata sull'mtime di
    auth.env (data presunta di generazione del token), non un valore
    letto dal token stesso: la CLI non espone oggi un modo
    programmatico di leggere la scadenza reale. Va trattata come
    promemoria approssimativo — la fonte esatta resta `claude /status`
    eseguito sulla VM (Sprint 0.6)."""
    stima = None
    if AUTH_ENV_PATH.exists():
        import time
        eta_giorni = (time.time() - AUTH_ENV_PATH.stat().st_mtime) / 86400
        stima = {
            "generato_circa_il": None,  # non ricostruibile dall'mtime da solo con precisione affidabile
            "giorni_dalla_modifica_file": round(eta_giorni),
            "giorni_alla_scadenza_stimata": round(VALIDITA_TOKEN_GIORNI - eta_giorni),
            "nota": "Stima da mtime di /etc/spada/auth.env, non dal token. Verificare con 'claude /status'.",
        }

    try:
        get_claude_env()
        return {"disponibile": True, "metodo": "oauth_subscription", "stima_scadenza": stima}
    except AutenticazioneClaudeNonDisponibile as e:
        return {"disponibile": False, "motivo": str(e), "stima_scadenza": stima}
