import asyncio
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_conn
from deliverables import elenca_deliverables, trova_deliverable
from grafo import estrai_grafo, leggi_corpo, leggi_frontmatter
from interventi import invoca_intervento
from models import (
    ApprovazioneRequest, AssistenteRequest, CreaGaraRequest,
    InterventoRequest, ProposaOperatoreRequest,
)
from paths import PIPELINE_DIR, SlugNonValido, gara_dir, percorso_sotto_gara, valida_slug

router = APIRouter(prefix="/gare", tags=["gare"])


def now():
    return datetime.now(timezone.utc).isoformat()


def _leggi_json(path: Path, default=None):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


@router.get("")
def elenco_gare():
    with get_conn() as con:
        righe = con.execute("SELECT * FROM gare ORDER BY creato_il DESC").fetchall()
    risultato = []
    for r in righe:
        fasi = _leggi_json(gara_dir(r["slug"]) / "_state" / "fasi.json", {})
        risultato.append({**dict(r), "fase_corrente": fasi.get("fase_corrente"),
                           "fasi": fasi.get("fasi", {})})
    return risultato


@router.post("", status_code=201)
def crea_gara(body: CreaGaraRequest):
    with get_conn() as con:
        if con.execute("SELECT 1 FROM gare WHERE slug=?", (body.slug,)).fetchone():
            raise HTTPException(409, f"Gara '{body.slug}' esiste già.")

    script = PIPELINE_DIR / "scripts" / "setup" / "new_gara.sh"
    if not script.exists():
        raise HTTPException(500, f"new_gara.sh non trovato in {script}")

    proc = subprocess.run(
        ["bash", str(script),
         "--slug", body.slug, "--nome", body.nome,
         "--regione", body.regione, "--anno-prezzario", str(body.anno_prezzario),
         "--modello", body.modello, "--effort", body.effort],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise HTTPException(500, f"new_gara.sh fallito: {proc.stderr.strip() or proc.stdout.strip()}")

    with get_conn() as con:
        con.execute(
            "INSERT INTO gare (slug, nome, regione, anno_prezzario, modello, effort, creato_il, stato) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (body.slug, body.nome, body.regione, body.anno_prezzario, body.modello, body.effort,
             now(), "creata"),
        )
    return {"slug": body.slug, "creato": True}


def _gara_o_404(slug: str):
    try:
        d = gara_dir(slug)
    except SlugNonValido as e:
        raise HTTPException(400, str(e))
    if not d.exists():
        raise HTTPException(404, f"Gara '{slug}' non trovata.")
    return d


@router.get("/{slug}")
def dettaglio_gara(slug: str):
    d = _gara_o_404(slug)
    manifest = _leggi_json(d / "manifest.json", {})
    fasi = _leggi_json(d / "_state" / "fasi.json", {})
    attivita = _leggi_json(d / "_state" / "attivita.json", {})
    return {"manifest": manifest, "fasi": fasi, "attivita": attivita}


@router.get("/{slug}/grafo")
def grafo_gara(slug: str):
    """Grafo strutturato (nodi/archi) per la vista visuale del frontend
    (Sprint 10.1). Ricostruito ad ogni richiesta dai file 02_graph/ —
    nessuna copia, il filesystem resta l'unica fonte di verità."""
    d = _gara_o_404(slug)
    return estrai_grafo(d)


@router.post("/{slug}/documenti")
async def carica_documento(slug: str, categoria: str, file: UploadFile):
    if categoria not in ("disciplinare", "elaborati", "p7m"):
        raise HTTPException(400, "categoria deve essere disciplinare, elaborati o p7m")
    _gara_o_404(slug)
    dest_dir = percorso_sotto_gara(slug, "input", categoria)
    dest_dir.mkdir(parents=True, exist_ok=True)
    nome_file = Path(file.filename).name  # scarta ogni componente di percorso dal nome client
    dest = dest_dir / nome_file
    contenuto = await file.read()
    dest.write_bytes(contenuto)

    with get_conn() as con:
        con.execute(
            "INSERT INTO documenti (gara_slug, nome_file, percorso, categoria, caricato_il) VALUES (?,?,?,?,?)",
            (slug, nome_file, str(dest.relative_to(gara_dir(slug))), categoria, now()),
        )

    # Ingestione incrementale (Sprint 8): un upload a gara avviata non
    # rilancia nulla da solo — l'interfaccia deve poter chiedere
    # esplicitamente quale fase già completata rieseguire tenendo conto
    # del nuovo documento. Qui si limita a segnalare quali fasi sono
    # già completate (candidate a una riesecuzione informata).
    fasi = _leggi_json(gara_dir(slug) / "_state" / "fasi.json", {}).get("fasi", {})
    fasi_completate = sorted(
        int(k.split("_")[0]) for k, v in fasi.items() if v.get("stato") == "completata"
    )
    return {
        "caricato": nome_file,
        "categoria": categoria,
        "fasi_completate_da_valutare": fasi_completate,
        "messaggio": (
            f"Documento caricato. Le fasi {fasi_completate} risultano già completate: "
            "valuta se rieseguirle per tenere conto del nuovo documento."
            if fasi_completate else
            "Documento caricato. Nessuna fase ancora completata da rivalutare."
        ),
    }


@router.get("/{slug}/documenti")
def elenco_documenti(slug: str):
    _gara_o_404(slug)
    with get_conn() as con:
        righe = con.execute(
            "SELECT nome_file, percorso, categoria, caricato_il FROM documenti "
            "WHERE gara_slug=? ORDER BY caricato_il DESC",
            (slug,),
        ).fetchall()
    return [dict(r) for r in righe]


def _accoda_job(slug: str, fase: int, tipo: str, deliverable_id: str | None = None):
    _gara_o_404(slug)
    if not (1 <= fase <= 7):
        raise HTTPException(400, "fase deve essere 1-7")
    with get_conn() as con:
        cur = con.execute(
            "INSERT INTO job (gara_slug, fase, tipo, stato, creato_il, deliverable_id) VALUES (?,?,?,?,?,?)",
            (slug, fase, tipo, "in_coda", now(), deliverable_id),
        )
        job_id = cur.lastrowid
    return {"job_id": job_id, "stato": "in_coda"}


@router.post("/{slug}/fasi/{fase}/esegui", status_code=202)
def esegui_fase(slug: str, fase: int):
    return _accoda_job(slug, fase, "esegui")


@router.post("/{slug}/fasi/{fase}/riesegui", status_code=202)
def riesegui_fase(slug: str, fase: int):
    return _accoda_job(slug, fase, "riesegui")


@router.post("/{slug}/fasi/{fase}/approva", status_code=202)
def approva_fase(slug: str, fase: int):
    return _accoda_job(slug, fase, "approva")


# ── Sprint 10.3 — deliverables come workspace separati ──────────────
@router.get("/{slug}/deliverables")
def elenco_deliverables(slug: str):
    d = _gara_o_404(slug)
    return elenca_deliverables(d)


def _deliverable_o_404(slug: str, deliverable_id: str):
    d = _gara_o_404(slug)
    dl = trova_deliverable(d, deliverable_id)
    if dl is None:
        raise HTTPException(404, f"Deliverable '{deliverable_id}' non trovato (controlla manifest.json → deliverables).")
    return dl


@router.post("/{slug}/deliverables/{deliverable_id}/esegui", status_code=202)
def esegui_deliverable(slug: str, deliverable_id: str):
    _deliverable_o_404(slug, deliverable_id)
    return _accoda_job(slug, 6, "esegui", deliverable_id=deliverable_id)


@router.post("/{slug}/deliverables/{deliverable_id}/riesegui", status_code=202)
def riesegui_deliverable(slug: str, deliverable_id: str):
    _deliverable_o_404(slug, deliverable_id)
    return _accoda_job(slug, 6, "riesegui", deliverable_id=deliverable_id)


PROPOSTA_ID_RE = re.compile(r"^P-C[0-9]+-[0-9]+$")


@router.get("/{slug}/proposte/{proposta_id}")
def dettaglio_proposta(slug: str, proposta_id: str):
    """Vista dettaglio proposta (Sprint 10.1): frontmatter + corpo del
    nodo in 02_graph/proposals/. Esiste solo per proposte già elaborate
    da feedback-processor — prima di quel momento la proposta vive solo
    dentro Cx_output.md, non ancora come nodo del grafo."""
    if not PROPOSTA_ID_RE.match(proposta_id):
        raise HTTPException(400, f"id proposta non valido: {proposta_id!r}")
    d = _gara_o_404(slug)
    corrispondenze = list((d / "02_graph" / "proposals").glob(f"{proposta_id}_*.md")) if (d / "02_graph" / "proposals").exists() else []
    if not corrispondenze:
        raise HTTPException(404, f"Nodo proposta non trovato per {proposta_id} (feedback non ancora elaborato?)")
    f = corrispondenze[0]
    meta, ok = leggi_frontmatter(f)
    if not ok:
        raise HTTPException(500, f"Frontmatter non valido in {f.name}")
    return {"frontmatter": meta, "corpo": leggi_corpo(f)}


# ── Sprint 10.2 — proposte del professionista, ancorate a un gap ────
PROPOSTE_OPERATORE_HEADER = "# Proposte del professionista — {criterio}\n\n"


@router.get("/{slug}/proposte-operatore")
def elenco_proposte_operatore(slug: str, criterio: str | None = None):
    _gara_o_404(slug)
    query = "SELECT * FROM proposte_operatore WHERE gara_slug=?"
    parametri = [slug]
    if criterio:
        query += " AND criterio=?"
        parametri.append(criterio)
    query += " ORDER BY creato_il DESC"
    with get_conn() as con:
        righe = con.execute(query, parametri).fetchall()
    return [dict(r) for r in righe]


@router.post("/{slug}/proposte-operatore", status_code=201)
def crea_proposta_operatore(slug: str, body: ProposaOperatoreRequest):
    d = _gara_o_404(slug)
    timestamp = now()

    with get_conn() as con:
        cur = con.execute(
            "INSERT INTO proposte_operatore (gara_slug, criterio, gap_id, titolo, descrizione, creato_il) "
            "VALUES (?,?,?,?,?,?)",
            (slug, body.criterio, body.gap_id, body.titolo, body.descrizione, timestamp),
        )
        proposta_id = cur.lastrowid

    # File di input per criterion-agent (fonte di verità sui dati, la
    # riga in DB è solo indice veloce per il frontend — stesso principio
    # di documenti/approvazioni).
    percorso = percorso_sotto_gara(slug, "output", "07_questions", f"proposte_operatore_{body.criterio}.md")
    percorso.parent.mkdir(parents=True, exist_ok=True)
    if not percorso.exists():
        percorso.write_text(PROPOSTE_OPERATORE_HEADER.format(criterio=body.criterio), encoding="utf-8")
    with percorso.open("a", encoding="utf-8") as f:
        f.write(f"## Proposta — {timestamp}\n")
        f.write(f"**Titolo:** {body.titolo}\n")
        f.write(f"**Gap collegato:** {body.gap_id or 'nessuno'}\n")
        f.write(f"**Descrizione:**\n{body.descrizione}\n\n---\n\n")

    return {"id": proposta_id, "creato": True}


@router.get("/{slug}/output")
def elenco_output(slug: str):
    d = _gara_o_404(slug)
    output_dir = d / "output"
    if not output_dir.exists():
        return []
    return sorted(str(p.relative_to(output_dir)) for p in output_dir.rglob("*") if p.is_file())


@router.get("/{slug}/output/{percorso:path}")
def leggi_output(slug: str, percorso: str):
    _gara_o_404(slug)
    file_path = percorso_sotto_gara(slug, "output", percorso)
    if not file_path.is_file():
        raise HTTPException(404, f"File non trovato: {percorso}")
    return FileResponse(str(file_path))


@router.get("/{slug}/run-log")
def run_log(slug: str):
    d = _gara_o_404(slug)
    return _leggi_json(d / "_state" / "run_log.json", {"runs": []})


@router.post("/{slug}/approvazioni", status_code=201)
def registra_approvazione(slug: str, body: ApprovazioneRequest):
    _gara_o_404(slug)
    with get_conn() as con:
        cur = con.execute(
            "INSERT INTO approvazioni (gara_slug, fase, tipo, riferimento, decisione, nota, creato_il) "
            "VALUES (?,?,?,?,?,?,?)",
            (slug, body.fase, body.tipo, body.riferimento, body.decisione, body.nota, now()),
        )
    return {"id": cur.lastrowid}


@router.post("/{slug}/assistente")
def assistente(slug: str, body: AssistenteRequest):
    d = _gara_o_404(slug)
    fasi = _leggi_json(d / "_state" / "fasi.json", {})
    fase2 = fasi.get("fasi", {}).get("2_costruzione_grafo", {})
    if fase2.get("stato") != "completata":
        raise HTTPException(
            409, "L'assistente è disponibile solo dopo il completamento della Fase 2 "
                 "(costruzione del knowledge graph)."
        )
    # Non deve girare mentre una fase sta scrivendo sulla stessa gara:
    # leggerebbe file a metà scrittura, e "sola lettura" deve restare
    # vero anche nel senso di "non interferisce con una scrittura in corso".
    with get_conn() as con:
        in_corso = con.execute(
            "SELECT 1 FROM job WHERE gara_slug=? AND stato='in_esecuzione'", (slug,)
        ).fetchone()
    if in_corso:
        raise HTTPException(409, "Una fase è in esecuzione su questa gara: riprova a conversazione conclusa.")

    with get_conn() as con:
        con.execute(
            "INSERT INTO conversazioni (gara_slug, ruolo, testo, creato_il) VALUES (?,?,?,?)",
            (slug, "utente", body.messaggio, now()),
        )

    from assistente import invoca_assistente
    try:
        risposta = invoca_assistente(slug, body.messaggio)
    except Exception as e:
        raise HTTPException(500, f"Assistente non disponibile: {e}")

    with get_conn() as con:
        con.execute(
            "INSERT INTO conversazioni (gara_slug, ruolo, testo, creato_il) VALUES (?,?,?,?)",
            (slug, "assistente", risposta, now()),
        )
    return {"risposta": risposta}


@router.get("/{slug}/assistente")
def cronologia_assistente(slug: str):
    _gara_o_404(slug)
    with get_conn() as con:
        righe = con.execute(
            "SELECT ruolo, testo, creato_il FROM conversazioni WHERE gara_slug=? ORDER BY creato_il ASC",
            (slug,),
        ).fetchall()
    return [dict(r) for r in righe]


# ── Sprint 10.4 — chat a controllo pieno (scrittura consentita) ─────
@router.post("/{slug}/interventi")
def intervento(slug: str, body: InterventoRequest):
    _gara_o_404(slug)
    # Stesso gate di /assistente: non deve girare mentre una fase sta
    # scrivendo sulla stessa gara, qui a maggior ragione perché anche
    # l'intervento scrive file — due scritture concorrenti sulla stessa
    # directory sarebbero un rischio reale, non solo di lettura sporca.
    with get_conn() as con:
        in_corso = con.execute(
            "SELECT 1 FROM job WHERE gara_slug=? AND stato='in_esecuzione'", (slug,)
        ).fetchone()
    if in_corso:
        raise HTTPException(409, "Una fase è in esecuzione su questa gara: riprova a intervento concluso.")

    with get_conn() as con:
        con.execute(
            "INSERT INTO interventi (gara_slug, ruolo, testo, creato_il) VALUES (?,?,?,?)",
            (slug, "utente", body.messaggio, now()),
        )

    try:
        esito = invoca_intervento(slug, body.messaggio)
    except Exception as e:
        raise HTTPException(500, f"Intervento non disponibile: {e}")

    with get_conn() as con:
        con.execute(
            "INSERT INTO interventi (gara_slug, ruolo, testo, creato_il) VALUES (?,?,?,?)",
            (slug, "claude", esito["risposta"], now()),
        )
    return esito


@router.get("/{slug}/interventi")
def cronologia_interventi(slug: str):
    _gara_o_404(slug)
    with get_conn() as con:
        righe = con.execute(
            "SELECT ruolo, testo, creato_il FROM interventi WHERE gara_slug=? ORDER BY creato_il ASC",
            (slug,),
        ).fetchall()
    return [dict(r) for r in righe]


@router.get("/{slug}/stream")
async def stream_stato(slug: str):
    d = _gara_o_404(slug)

    async def generatore():
        ultimo = None
        while True:
            fasi = _leggi_json(d / "_state" / "fasi.json", {})
            attivita = _leggi_json(d / "_state" / "attivita.json", {})
            payload = json.dumps({"fasi": fasi, "attivita": attivita}, ensure_ascii=False)
            if payload != ultimo:
                yield f"data: {payload}\n\n"
                ultimo = payload
            await asyncio.sleep(1.0)

    return StreamingResponse(generatore(), media_type="text/event-stream")
