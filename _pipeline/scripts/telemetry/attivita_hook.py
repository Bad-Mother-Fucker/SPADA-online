#!/usr/bin/env python3
"""attivita_hook.py — hook Claude Code che aggiorna _state/attivita.json
in modo incrementale (Sprint 3.4).

Registrato per tre eventi (vedi _pipeline/settings.json):
  PreToolUse (matcher "Task|Agent") -> un subagente parte
  SubagentStop                 -> un subagente finisce
  Stop                         -> l'orchestratore chiude un turno:
                                   rigenera la sintesi in linguaggio
                                   naturale in _state/fasi.json (Sprint
                                   3.5). NON svuota agenti_attivi: in
                                   headless l'orchestratore chiude il
                                   turno anche con subagenti ancora in
                                   background (vedi CLAUDE_CODE_PRINT_BG_
                                   WAIT_CEILING_MS in spada_claude.sh).
                                   Chi resta "attivo" quando claude esce
                                   lo chiude spada_fase.sh / spada_
                                   deliverable.sh (chiudi_agenti_rimasti
                                   in spada_comune.sh).

Scrive relativo a `cwd` del payload (la working directory della gara,
non un percorso di pipeline) — coerente con com'e' invocato ogni
`claude -p` da spada-fase (cwd = radice della gara).

Non fallisce mai in modo bloccante: un evento di telemetria perso non
deve interrompere l'esecuzione della fase. Esce sempre 0.

ATTENZIONE (rischio principale del piano, vedi piano SPADA Online
§Sprint 3): la documentazione Claude Code non conferma un campo di
correlazione esplicito tra il PreToolUse che lancia un subagente
(tool_use_id) e il SubagentStop corrispondente. Qui si usa un
euristica FIFO per `agent_type`: alla ricezione di un SubagentStop con
`agent_type = X`, si chiude la voce PIU' VECCHIA in `agenti_attivi` con
quel tipo. Corretto quando i subagenti dello stesso tipo non girano in
overlap arbitrario, ma va validato su una fase reale (graph-builder
Fase 2, che lancia piu' istanze dello stesso tipo in parallelo) prima
di fidarsene per la vista agenti.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_DIR = Path("_state")
ATTIVITA_PATH = STATE_DIR / "attivita.json"


def now():
    return datetime.now(timezone.utc).isoformat()


def load_payload():
    try:
        return json.loads(sys.stdin.read())
    except Exception:
        return {}


def load_attivita():
    data = None
    if ATTIVITA_PATH.exists():
        try:
            data = json.loads(ATTIVITA_PATH.read_text(encoding="utf-8"))
        except Exception:
            data = None
    if not isinstance(data, dict):
        data = {"aggiornato_il": now()}
    # new_gara.sh creava il file senza agenti_conclusi: SubagentStop e
    # Stop morivano di KeyError (inghiottito in main) e nessun agente
    # usciva mai da agenti_attivi. Le chiavi si garantiscono qui, non
    # solo nel template.
    data.setdefault("agenti_attivi", [])
    data.setdefault("agenti_conclusi", [])
    return data


def save_attivita(data):
    data["aggiornato_il"] = now()
    STATE_DIR.mkdir(exist_ok=True)
    ATTIVITA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def handle_pre_tool_use(payload, data):
    # "Agent" e' il nome attuale del tool che lancia un subagente;
    # "Task" quello delle versioni di Claude Code su cui e' nato l'hook.
    if payload.get("tool_name") not in ("Task", "Agent"):
        return
    tool_input = payload.get("tool_input") or {}
    data["agenti_attivi"].append({
        "agente": tool_input.get("subagent_type", "sconosciuto"),
        "descrizione": tool_input.get("description", ""),
        "tool_use_id": payload.get("tool_use_id"),
        "iniziato_il": now(),
    })


def handle_subagent_stop(payload, data):
    agent_type = payload.get("agent_type")
    agent_id = payload.get("agent_id")
    attivi = data["agenti_attivi"]

    idx = None
    if agent_id:
        for i, e in enumerate(attivi):
            if e.get("tool_use_id") == agent_id:
                idx = i
                break
    if idx is None:
        for i, e in enumerate(attivi):
            if e.get("agente") == agent_type:
                idx = i
                break

    if idx is not None:
        entry = attivi.pop(idx)
    else:
        entry = {"agente": agent_type or "sconosciuto", "descrizione": "", "iniziato_il": None}

    entry["concluso_il"] = now()
    entry["stato"] = "completato"
    data["agenti_conclusi"].append(entry)
    # tieni solo gli ultimi 200 conclusi per non far crescere il file all'infinito
    data["agenti_conclusi"] = data["agenti_conclusi"][-200:]


def sintesi_naturale(data):
    n_attivi = len(data["agenti_attivi"])
    n_conclusi_recenti = sum(
        1 for e in data["agenti_conclusi"]
        if e.get("concluso_il", "") >= (data["agenti_attivi"][0]["iniziato_il"] if data["agenti_attivi"] else "")
    )
    if n_attivi == 0 and not data["agenti_conclusi"]:
        return ""
    if n_attivi == 0:
        return f"Nessun agente attivo. {len(data['agenti_conclusi'])} completati in questa fase."
    per_tipo = {}
    for e in data["agenti_attivi"]:
        per_tipo[e["agente"]] = per_tipo.get(e["agente"], 0) + 1
    dettaglio = ", ".join(f"{v} {k}" for k, v in per_tipo.items())
    return f"{n_attivi} agenti al lavoro ({dettaglio})."


def handle_stop(payload, data):
    fasi_path = STATE_DIR / "fasi.json"
    if not fasi_path.exists():
        return
    try:
        fasi = json.loads(fasi_path.read_text(encoding="utf-8"))
    except Exception:
        return
    fase_corrente = fasi.get("fase_corrente")
    chiave = next((k for k in fasi.get("fasi", {}) if k.startswith(f"{fase_corrente}_")), None)
    if chiave:
        fasi["fasi"][chiave]["sintesi"] = sintesi_naturale(data)
        fasi_path.write_text(json.dumps(fasi, ensure_ascii=False, indent=2), encoding="utf-8")
    # agenti_attivi resta com'e': i subagenti in background sopravvivono
    # alla fine del turno dell'orchestratore (vedi docstring).


def main():
    payload = load_payload()
    event = payload.get("hook_event_name", "")
    data = load_attivita()

    if event == "PreToolUse":
        handle_pre_tool_use(payload, data)
    elif event == "SubagentStop":
        handle_subagent_stop(payload, data)
    elif event == "Stop":
        handle_stop(payload, data)
    else:
        return

    try:
        save_attivita(data)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # la telemetria non deve mai bloccare la fase
    sys.exit(0)
