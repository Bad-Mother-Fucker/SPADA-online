"""Assistente di gara (Sprint 7) — sessione Claude Code in sola
lettura sul workspace di una gara specifica. Nessuna modifica ai file,
nessun avvio di fasi: solo domande e risposte con citazione delle
fonti (nomenclatura nativa di progetto, es. 08.Q.R02).

Disponibile solo dopo la Fase 2 (knowledge graph costruito) — verificato
dal chiamante (routers/gare.py) prima di invocare questo modulo.
"""
import subprocess
from pathlib import Path

from auth import get_claude_env
from paths import PIPELINE_DIR, gara_dir

TIMEOUT_SECONDI = 5 * 60

# Sola lettura, esplicitamente: nessun tool di scrittura o esecuzione
# shell, nessun avvio subagente/fase. mcp__prezzario__* non è incluso
# in --tools (che riguarda solo i tool nativi) e resta disponibile:
# è comunque un server di sole query, nessuna mutazione possibile.
TOOLS_CONSENTITI = "Read,Grep,Glob"
TOOLS_VIETATI = "Write,Edit,Bash,Task,NotebookEdit,mcp__prezzario__* "  # spazio finale innocuo, difesa in profondità


def _leggi_o_vuoto(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else "(vuoto)"


def costruisci_prompt(slug: str, messaggio: str) -> str:
    d = gara_dir(slug)
    memoria = _leggi_o_vuoto(d / "_state" / "memoria.md")
    manifest = _leggi_o_vuoto(d / "manifest.json")
    return f"""Sei l'assistente di consultazione per la gara "{slug}", in sola lettura.

Regole:
- Non modificare alcun file, non avviare fasi, non invocare subagenti.
- Rispondi solo a domande di merito sulla gara, citando sempre la fonte
  (nodo del grafo, documento, sezione) con la nomenclatura nativa di
  progetto (es. "08.Q.R02"), non identificatori interni.
- Se la risposta richiede dati che non trovi nei file consultabili,
  dillo esplicitamente — non inventare.
- Consulta 02_graph/ e output/ su richiesta (leggi index.md per primo,
  come fanno tutti gli agenti della pipeline). Il prezzario si consulta
  con gli strumenti MCP disponibili, in sola lettura.

Manifest della gara:
```json
{manifest}
```

Digest cumulativo (_state/memoria.md):
```
{memoria}
```

Domanda del professionista:
{messaggio}
"""


def invoca_assistente(slug: str, messaggio: str) -> str:
    d = gara_dir(slug)
    prompt = costruisci_prompt(slug, messaggio)
    env_claude = get_claude_env()

    import os
    env = {**os.environ, **env_claude}
    argv = [
        "claude", "-p", prompt,
        "--setting-sources", "user",
        "--tools", TOOLS_CONSENTITI,
        "--disallowedTools", TOOLS_VIETATI,
    ]
    proc = subprocess.run(
        argv, cwd=str(d), env=env, capture_output=True, text=True, timeout=TIMEOUT_SECONDI,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Assistente: claude -p uscito con codice {proc.returncode}: {proc.stderr[-500:]}")
    return proc.stdout.strip()
