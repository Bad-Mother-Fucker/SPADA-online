"""Avanzamento dal vivo di una fase o di un deliverable in esecuzione.

Ogni esecuzione scrive lo stream di Claude in _state/run_<id>.stream.jsonl
(spada_fase.sh, spada_deliverable.sh). Qui se ne leggono le ultime righe
e si traducono in passi leggibili («Leggo il nodo del grafo …», «Aggiorno
l'indice …»): le stesse frasi della ricerca approfondita dell'assistente.
Solo lettura: nessun effetto sull'esecuzione.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from assistente import descrivi_strumento

CODA_BYTE = 256 * 1024  # bastano per gli ultimi passi anche con risultati lunghi
PASSI = 4


def _run_in_corso(d: Path, fase: int | None, deliverable_id: str | None) -> dict | None:
    try:
        runs = json.loads((d / "_state" / "run_log.json").read_text(encoding="utf-8")).get("runs", [])
    except (OSError, ValueError):
        return None
    for run in reversed(runs):
        if run.get("esito") != "in_corso":
            continue
        if deliverable_id is not None and run.get("deliverable_id") != deliverable_id:
            continue
        if deliverable_id is None and (run.get("deliverable_id") or (fase is not None and run.get("fase") != fase)):
            continue
        return run
    return None


def _passi(stream: Path) -> list[str]:
    with stream.open("rb") as f:
        f.seek(max(0, stream.stat().st_size - CODA_BYTE))
        righe = f.read().decode("utf-8", errors="ignore").splitlines()
    base = stream.parent.parent
    passi: list[str] = []
    for riga in righe:
        try:
            e = json.loads(riga)
        except ValueError:
            continue  # la prima riga della coda può essere tagliata a metà
        if e.get("type") != "assistant":
            continue
        for b in (e.get("message") or {}).get("content") or []:
            if b.get("type") == "tool_use":
                passi.append(descrivi_strumento(b.get("name", ""), b.get("input") or {}, base))
            elif b.get("type") == "text" and b.get("text", "").strip():
                prima = b["text"].strip().splitlines()[0].strip(" #*")
                if prima:
                    passi.append(prima if len(prima) <= 160 else prima[:157].rstrip() + "…")
    # Due letture di fila dello stesso file sono un passo solo.
    compatti = [p for i, p in enumerate(passi) if i == 0 or p != passi[i - 1]]
    return compatti


def avanzamento(d: Path, fase: int | None = None, deliverable_id: str | None = None) -> dict | None:
    run = _run_in_corso(d, fase, deliverable_id)
    if run is None:
        return None
    stream = d / "_state" / f"run_{run['run_id']}.stream.jsonl"
    passi = _passi(stream) if stream.is_file() else []
    aggiornato = (datetime.fromtimestamp(os.path.getmtime(stream), timezone.utc).isoformat()
                  if stream.is_file() else None)
    return {
        "run_id": run["run_id"], "fase": run.get("fase"), "criterio": run.get("criterio"),
        "deliverable_id": run.get("deliverable_id"), "avviato_il": run.get("avviato_il"),
        "aggiornato_il": aggiornato,
        "attuale": passi[-1] if passi else None, "precedenti": passi[-PASSI:-1][::-1],
    }
