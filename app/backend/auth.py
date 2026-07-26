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


def get_claude_env() -> dict:
    """Ritorna le variabili d'ambiente da iniettare nel subprocess che
    lancia `claude` (via spada-fase). Solleva se non c'è nulla di
    utilizzabile — il worker deve fallire il job in modo esplicito,
    mai procedere senza autenticazione."""
    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if not token:
        env_file = Path("/etc/spada/auth.env")
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
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
    """Per GET /sistema/auth — non solleva mai, riporta lo stato."""
    try:
        get_claude_env()
        return {"disponibile": True, "metodo": "oauth_subscription"}
    except AutenticazioneClaudeNonDisponibile as e:
        return {"disponibile": False, "motivo": str(e)}
