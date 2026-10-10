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
from paths import SPADA_CLAUDE, gara_dir

TIMEOUT_SECONDI = 5 * 60

# Sola lettura, esplicitamente: nessun tool di scrittura o esecuzione
# shell, nessun avvio subagente/fase. mcp__prezzario__* non è incluso
# in --tools (che riguarda solo i tool nativi) e resta disponibile:
# è comunque un server di sole query, nessuna mutazione possibile.
TOOLS_CONSENTITI = "Read,Grep,Glob"
TOOLS_VIETATI = "Write,Edit,Bash,Task,Agent,NotebookEdit,mcp__prezzario__* "  # spazio finale innocuo, difesa in profondità


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
    # spada_claude.sh aggiunge config dedicata, --setting-sources user e
    # il solo server MCP prezzario (versione locale).
    argv = [
        "bash", str(SPADA_CLAUDE), "-p", prompt,
        "--tools", TOOLS_CONSENTITI,
        "--disallowedTools", TOOLS_VIETATI,
    ]
    proc = subprocess.run(
        argv, cwd=str(d), env=env, capture_output=True, text=True, timeout=TIMEOUT_SECONDI,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Assistente: claude -p uscito con codice {proc.returncode}: {proc.stderr[-500:]}")
    return proc.stdout.strip()


# ── Risposta in streaming, due modalità ────────────────────────────────
#
# Stesse regole e stessi strumenti in sola lettura di invoca_assistente;
# cambia quanto lavoro si chiede. «rapida»: modello veloce, risposta
# breve dai dati già nel prompt (manifest, memoria) o da una lettura
# mirata. «approfondita»: più ricerche e verifiche, risposta articolata.
#
# All'interfaccia arrivano solo eventi osservabili: il testo della
# risposta mentre viene scritto e, come stato, gli strumenti che
# l'assistente usa davvero (documento aperto, ricerca, file cercati). I
# blocchi di ragionamento interno del modello non vengono mai inoltrati.

import json
import os
import re
import signal
from typing import Iterator

MODALITA = {
    "rapida": {
        "argomenti": ["--model", "haiku"],
        "istruzioni": (
            "Modalità RISPOSTA RAPIDA: rispondi in una o due frasi, diretto. "
            "Usa prima il manifest e il digest qui sotto; apri un file solo se "
            "lì non c'è la risposta, e al massimo uno o due file mirati. "
            "Niente analisi estese. Se il dato non è verificabile, dillo. "
            "Non citare file interni (manifest.json, memoria.md): un dato del "
            "manifest si cita come «dati di gara»."
        ),
    },
    "approfondita": {
        "argomenti": ["--model", "sonnet", "--effort", "high"],
        "istruzioni": (
            "Modalità RICERCA APPROFONDITA: verifica nei documenti e negli "
            "elaborati, confronta le fonti quando divergono, e rispondi in "
            "modo articolato citando ogni fonte usata e le incertezze che restano."
        ),
    },
}


def _relativo(percorso: str, base: Path) -> str:
    try:
        return str(Path(percorso).resolve().relative_to(base.resolve()))
    except (ValueError, OSError):
        return Path(percorso).name


def descrivi_strumento(nome: str, argomenti: dict, base: Path) -> str:
    """Una riga in italiano per lo strumento che l'assistente sta usando:
    solo ciò che fa davvero, con i suoi argomenti."""
    a = argomenti or {}
    if nome == "Read":
        rel = _relativo(a.get("file_path", ""), base)
        if rel.startswith("_state/"):
            return "Controllo lo stato di avanzamento della gara"
        if rel.startswith("02_graph/") and Path(rel).stem == "index":
            return "Leggo l'indice del grafo di conoscenza"
        if rel.startswith("02_graph/"):
            return f"Leggo il nodo del grafo {Path(rel).stem}"
        if rel.startswith("input/"):
            return f"Leggo il documento di gara {Path(rel).name}"
        if rel.startswith("output/"):
            return f"Leggo l'elaborato {Path(rel).name}"
        return f"Leggo {rel}"
    if nome == "Grep":
        rel = _relativo(a["path"], base) if a.get("path") else ""
        radice = rel.split("/")[0]
        dove = {"": "in tutta la gara", ".": "in tutta la gara", "input": "nei documenti di gara",
                "output": "negli elaborati", "02_graph": "nel grafo di conoscenza"}.get(radice, f"in {rel}")
        return f"Cerco «{a.get('pattern', '')}» {dove}"
    if nome == "Glob":
        # Un pattern fatto solo di caratteri jolly non dice nulla a chi legge.
        parole = re.sub(r"[*?{}\[\],/._-]+", " ", a.get("pattern", "")).split()
        utili = [p for p in parole if p not in ("02", "graph", "output", "input", "md", "json", "nodes")]
        return f"Cerco i file «{' '.join(utili)}»" if utili else "Elenco i documenti e gli elaborati disponibili"
    if nome.startswith("mcp__prezzario__"):
        voce = nome.removeprefix("mcp__prezzario__")
        if voce == "cerca_voce":
            return f"Cerco nel prezzario «{a.get('testo', '')}»"
        if voce == "dettaglio_analisi":
            return f"Leggo l'analisi della voce {a.get('codice_tariffa', '')}"
        if voce == "confronta_prezzo":
            return "Confronto un prezzo con il prezzario"
        return "Controllo il prezzario disponibile"
    return f"Uso lo strumento {nome}"


def stream_assistente(slug: str, messaggio: str, modalita: str) -> Iterator[dict]:
    """Eventi per l'interfaccia, uno per riga:
    {"tipo": "stato", "testo"}   strumento in uso (evento reale)
    {"tipo": "nuovo"}            l'assistente ricomincia a scrivere: il
                                 testo parziale precedente era un passaggio
                                 intermedio, non la risposta
    {"tipo": "testo", "delta"}   pezzo della risposta
    {"tipo": "fine", "risposta"} risposta completa (quella salvata)
    {"tipo": "errore", "messaggio"}"""
    conf = MODALITA[modalita]
    d = gara_dir(slug)
    prompt = costruisci_prompt(slug, messaggio).replace(
        "Regole:\n", f"Regole:\n- {conf['istruzioni']}\n", 1)
    env = {**os.environ, **get_claude_env()}
    argv = [
        "bash", str(SPADA_CLAUDE), "-p", prompt,
        "--tools", TOOLS_CONSENTITI,
        "--disallowedTools", TOOLS_VIETATI,
        "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--no-session-persistence", *conf["argomenti"],
    ]
    proc = subprocess.Popen(argv, cwd=str(d), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, start_new_session=True)
    testo = ""          # risposta in costruzione (ultimo messaggio dell'assistente)
    risultato = None
    errore = None
    try:
        for riga in proc.stdout:
            try:
                ev = json.loads(riga)
            except json.JSONDecodeError:
                continue
            tipo = ev.get("type")
            if tipo == "stream_event":
                e = ev.get("event") or {}
                if e.get("type") == "message_start" and testo:
                    testo = ""
                    yield {"tipo": "nuovo"}
                elif e.get("type") == "content_block_delta":
                    delta = e.get("delta") or {}
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        testo += delta["text"]
                        yield {"tipo": "testo", "delta": delta["text"]}
            elif tipo == "assistant":
                for blocco in (ev.get("message") or {}).get("content") or []:
                    if blocco.get("type") == "tool_use":
                        yield {"tipo": "stato", "testo": descrivi_strumento(blocco.get("name", ""), blocco.get("input") or {}, d)}
            elif tipo == "result":
                if ev.get("is_error"):
                    errore = str(ev.get("result") or ev.get("subtype") or "errore")
                else:
                    risultato = (ev.get("result") or testo).strip()
        proc.wait(timeout=30)
        if risultato is None and errore is None:
            errore = (proc.stderr.read() or "")[-500:] or f"claude uscito con codice {proc.returncode}"
    finally:
        # Interfaccia chiusa o richiesta interrotta: non resta nulla in giro.
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    if errore:
        yield {"tipo": "errore", "messaggio": errore}
    else:
        yield {"tipo": "fine", "risposta": risultato}
