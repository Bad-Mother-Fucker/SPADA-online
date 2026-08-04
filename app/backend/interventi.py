"""Chat a controllo pieno (Sprint 10.4) — sessione Claude Code con
scrittura consentita, per interventi mirati su UNA gara specifica, a
richiesta del professionista.

A differenza di assistente.py (Sprint 7, sola lettura, `--tools
Read,Grep,Glob` + `--disallowedTools` come difesa in profondità), qui
NON si passano `--tools`/`--disallowedTools`: come per spada_fase.sh,
un'invocazione headless (`-p`) senza restrizioni esplicite ha già
accesso completo ai tool, auto-approvato (nessun TTY per un prompt di
conferma) — vedi docs/sprint7-notes.md. "Controllo pieno" richiesto
esplicitamente dal professionista (nessun'altra restrizione oltre al
perimetro della gara).

Perimetro: `cwd` è la sola directory della gara (`gara_dir(slug)`), non
un sandbox a livello di sistema operativo — Bash potrebbe in teoria
uscirne con percorsi assoluti o `cd ..`. Non fingiamo una garanzia più
forte di quella reale: il perimetro effettivo è "stesso utente di
sistema del worker, stessa fiducia della pipeline stessa", coerente con
l'architettura a operatore singolo (Cloudflare Access, Sprint 9).

Continuità multi-turno: `--output-format json` include `session_id` (id
di conversazione headless); il turno successivo lo passa con
`--resume` così la conversazione prosegue invece di ripartire da zero.
Un solo session_id attivo per gara (interventi_sessioni).
"""
import json
import subprocess
import threading
from pathlib import Path

from auth import get_claude_env
from paths import gara_dir

TIMEOUT_SECONDI = 10 * 60

# Lock di processo, non solo di gara: uvicorn gira senza --workers (un
# solo processo), quindi un threading.Lock qui basta a impedire due
# `claude -p` di intervento concorrenti sulla stessa VM — a differenza
# del gate sulla tabella job (che copre solo le fasi accodate), questo
# copre anche due /interventi quasi simultanei su gare diverse, che non
# passano mai dalla coda job. Necessario su un e2-micro: due `claude -p`
# insieme sono già abbastanza per saturarlo (vedi incidente Sprint 10).
_LOCK_INTERVENTO = threading.Lock()


class InterventoGiaInCorso(RuntimeError):
    pass


def _leggi_o_vuoto(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else "(vuoto)"


def costruisci_prompt(slug: str, messaggio: str) -> str:
    d = gara_dir(slug)
    memoria = _leggi_o_vuoto(d / "_state" / "memoria.md")
    manifest = _leggi_o_vuoto(d / "manifest.json")
    return f"""Sei in una sessione di intervento mirato sulla gara "{slug}",
richiesta direttamente dal professionista per un'azione puntuale che
non rientra nel comando di una fase (es. correggere un file, rilanciare
un controllo, rispondere a una domanda operativa con verifica diretta
sui documenti). Hai accesso completo ai tool di lettura e scrittura,
limitato alla directory di questa gara.

Regole:
- Resta dentro la directory di questa gara: non hai motivo di leggere o
  scrivere altrove.
- Se l'intervento richiede di rieseguire una fase o un criterio intero,
  dillo esplicitamente invece di improvvisare una scorciatoia manuale:
  la pipeline ha gate e registri che un intervento diretto potrebbe
  disallineare.
- Non inventare dati: se manca un'informazione, dillo.
- Qualunque file tu modifichi, spiega cosa hai cambiato e perché nella
  risposta finale.

Manifest della gara:
```json
{manifest}
```

Digest cumulativo (_state/memoria.md):
```
{memoria}
```

Richiesta del professionista:
{messaggio}
"""


def _leggi_session_id(slug: str) -> str | None:
    from db import get_conn
    with get_conn() as con:
        riga = con.execute(
            "SELECT session_id FROM interventi_sessioni WHERE gara_slug=?", (slug,)
        ).fetchone()
    return riga["session_id"] if riga else None


def _salva_session_id(slug: str, session_id: str, now: str):
    from db import get_conn
    with get_conn() as con:
        con.execute(
            "INSERT INTO interventi_sessioni (gara_slug, session_id, aggiornato_il) VALUES (?,?,?) "
            "ON CONFLICT(gara_slug) DO UPDATE SET session_id=excluded.session_id, aggiornato_il=excluded.aggiornato_il",
            (slug, session_id, now),
        )


def invoca_intervento(slug: str, messaggio: str) -> dict:
    """Ritorna {"risposta": str, "session_id": str}. Solleva RuntimeError
    se claude -p fallisce o l'output non è il JSON atteso — mai un
    fallback silenzioso su un intervento che scrive file. Solleva
    InterventoGiaInCorso (senza nemmeno tentare) se un altro intervento
    è già in esecuzione su questa VM: non si accoda, si rifiuta subito,
    così l'operatore lo sa e riprova invece di aspettare in silenzio."""
    if not _LOCK_INTERVENTO.acquire(blocking=False):
        raise InterventoGiaInCorso(
            "Un altro intervento è già in esecuzione su questa VM: attendi che concluda e riprova."
        )
    try:
        d = gara_dir(slug)
        prompt = costruisci_prompt(slug, messaggio)
        env_claude = get_claude_env()

        import os
        env = {**os.environ, **env_claude}

        session_precedente = _leggi_session_id(slug)
        argv = [
            "claude", "-p", prompt,
            "--setting-sources", "user",
            "--output-format", "json",
        ]
        if session_precedente:
            argv += ["--resume", session_precedente]

        proc = subprocess.run(
            argv, cwd=str(d), env=env, capture_output=True, text=True, timeout=TIMEOUT_SECONDI,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Intervento: claude -p uscito con codice {proc.returncode}: {proc.stderr[-500:]}")

        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Intervento: output non JSON valido: {e}") from e

        risposta = payload.get("result")
        session_id = payload.get("session_id")
        if not risposta or not session_id:
            raise RuntimeError(f"Intervento: JSON senza 'result'/'session_id' attesi: {list(payload.keys())}")

        from datetime import datetime, timezone
        _salva_session_id(slug, session_id, datetime.now(timezone.utc).isoformat())

        return {"risposta": risposta, "session_id": session_id}
    finally:
        _LOCK_INTERVENTO.release()
