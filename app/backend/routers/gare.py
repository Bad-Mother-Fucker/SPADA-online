import asyncio
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_conn
from deliverables import elenca_deliverables, trova_deliverable
from grafo import estrai_grafo, leggi_corpo, leggi_frontmatter
from interventi import InterventoGiaInCorso, invoca_intervento
from models import (
    ApprovazioneRequest, AssistenteRequest, BozzaDomandeRequest, CreaGaraRequest,
    IntegraDocumentoRequest, InformazioneProfessionistaRequest, InterventoRequest,
    ProposaOperatoreRequest,
)
from paths import PIPELINE_DIR, SlugNonValido, gara_dir, percorso_sotto_gara, valida_slug

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_pipeline" / "scripts" / "domande"))
import domande as registro_domande  # noqa: E402
from prezzario import edizioni_installate, regione_canonica, stato_prezzario

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


def _job_attivi(slug: str) -> dict:
    """Job di fase in coda o in esecuzione per questa gara, per numero di
    fase (il più vecchio vince: è quello che il worker prenderà per primo)."""
    with get_conn() as con:
        righe = con.execute(
            "SELECT id, fase, stato, creato_il, iniziato_il, deliverable_id FROM job "
            "WHERE gara_slug=? AND stato IN ('in_coda','in_esecuzione') AND operazione IS NULL "
            "ORDER BY id", (slug,)).fetchall()
    out = {}
    for r in righe:
        out.setdefault(r["fase"], dict(r))
    return out


def _fasi_con_job(d: Path, slug: str) -> dict:
    """fasi.json con sopra lo stato della coda. fasi.json lo scrive lo
    script di fase solo quando parte davvero: senza questo, fra il clic
    su «Avvia» e l'avvio (o per un job scartato prima di partire) la fase
    restava «in coda» come se nulla fosse successo. Una fase con un job
    in coda o in corso risulta `in_esecuzione`, con `job` per distinguere
    «in avvio» (in coda nel worker) da «in esecuzione»."""
    fasi = _leggi_json(d / "_state" / "fasi.json", {})
    attivi = _job_attivi(slug)
    if not attivi:
        return fasi
    corpi = fasi.get("fasi", {})
    for n, job in attivi.items():
        k = next((x for x in corpi if x.startswith(f"{n}_")), None)
        if k is None:
            continue
        corpo = dict(corpi[k])
        if corpo.get("stato") != "in_esecuzione" or job["stato"] == "in_coda":
            corpo["stato"] = "in_esecuzione"
            corpo.pop("richiede_approvazione", None)
        corpo["job"] = {"id": job["id"], "stato": job["stato"], "creato_il": job["creato_il"],
                        "iniziato_il": job["iniziato_il"], "deliverable_id": job["deliverable_id"]}
        corpi[k] = corpo
    return {**fasi, "fasi": corpi}


@router.get("")
def elenco_gare():
    with get_conn() as con:
        righe = con.execute("SELECT * FROM gare ORDER BY creato_il DESC").fetchall()
    installate = {(e["regione"].lower(), e["anno"]) for e in edizioni_installate()}
    risultato = []
    for r in righe:
        fasi = _fasi_con_job(gara_dir(r["slug"]), r["slug"])
        risultato.append({**dict(r), "fase_corrente": fasi.get("fase_corrente"),
                           "fasi": fasi.get("fasi", {}),
                           "prezzario_disponibile": ((r["regione"] or "").lower(), r["anno_prezzario"]) in installate})
    return risultato


@router.post("", status_code=201)
def crea_gara(body: CreaGaraRequest):
    with get_conn() as con:
        if con.execute("SELECT 1 FROM gare WHERE slug=?", (body.slug,)).fetchone():
            raise HTTPException(409, f"Gara '{body.slug}' esiste già.")

    script = PIPELINE_DIR / "scripts" / "setup" / "new_gara.sh"
    if not script.exists():
        raise HTTPException(500, f"new_gara.sh non trovato in {script}")
    # Il prezzario può mancare: la gara si crea lo stesso e le fasi
    # saltano le valutazioni economiche. La regione si allinea però al
    # nome già usato nel database ("campania" → "Campania").
    body.regione = regione_canonica(body.regione)
    if not body.regione:
        raise HTTPException(400, "Indica la regione del prezzario di riferimento.")

    preesistente = gara_dir(body.slug).exists()
    proc = subprocess.run(
        ["bash", str(script),
         "--slug", body.slug, "--nome", body.nome,
         "--regione", body.regione, "--anno-prezzario", str(body.anno_prezzario),
         "--modello", body.modello, "--effort", body.effort],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        # Una cartella lasciata a metà bloccherebbe ogni nuovo tentativo
        # con lo stesso slug, e la gara risulterebbe esistere senza riga
        # in `gare`.
        if not preesistente:
            shutil.rmtree(gara_dir(body.slug), ignore_errors=True)
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
    fasi = _fasi_con_job(d, slug)
    attivita = _leggi_json(d / "_state" / "attivita.json", {})
    return {"manifest": manifest, "fasi": fasi, "attivita": attivita,
            "prezzario": stato_prezzario(d, manifest)}


@router.delete("/{slug}", status_code=204)
def elimina_gara(slug: str):
    """Elimina definitivamente una gara: riga in DB (con cascata sulle
    tabelle collegate — job, documenti, approvazioni, conversazioni,
    interventi, proposte_operatore, tutte ON DELETE CASCADE su
    gare.slug) e l'intera directory su filesystem. Non reversibile:
    non esiste un cestino né un ripristino."""
    d = _gara_o_404(slug)
    with get_conn() as con:
        in_corso = con.execute(
            "SELECT 1 FROM job WHERE gara_slug=? AND stato='in_esecuzione'", (slug,)
        ).fetchone()
        if in_corso:
            raise HTTPException(409, "Una fase è in esecuzione su questa gara: attendi la conclusione prima di eliminarla.")
        con.execute("DELETE FROM gare WHERE slug=?", (slug,))
    shutil.rmtree(d, ignore_errors=True)


@router.get("/{slug}/grafo")
def grafo_gara(slug: str):
    """Grafo strutturato (nodi/archi) per la vista visuale del frontend
    (Sprint 10.1). Ricostruito ad ogni richiesta dai file 02_graph/ —
    nessuna copia, il filesystem resta l'unica fonte di verità."""
    d = _gara_o_404(slug)
    return estrai_grafo(d)


@router.post("/{slug}/documenti")
def carica_documento(slug: str, categoria: str, file: UploadFile):
    # def, non async def: come il resto del router, così FastAPI esegue
    # l'intero handler in un thread del pool. Con async def, la lettura
    # del file e la scrittura su disco (entrambe bloccanti sull'unico
    # processo uvicorn, nessun --workers) stallavano il loop eventi per
    # tutta la durata dell'upload — compreso lo stream SSE e ogni altra
    # richiesta concorrente sullo stesso Tunnel — con il rischio che il
    # client ricevesse una risposta troncata su file grandi.
    if categoria not in ("disciplinare", "elaborati", "p7m"):
        raise HTTPException(400, "categoria deve essere disciplinare, elaborati o p7m")
    _gara_o_404(slug)
    dest_dir = percorso_sotto_gara(slug, "input", categoria)
    dest_dir.mkdir(parents=True, exist_ok=True)
    nome_file = Path(file.filename).name  # scarta ogni componente di percorso dal nome client
    dest = dest_dir / nome_file
    # A blocchi, non file.read(): nessun limite di dimensione lato
    # interfaccia, quindi un elaborato da centinaia di MB non deve passare
    # tutto in memoria. Prima su un file temporaneo nella stessa cartella,
    # poi rinominato: un upload interrotto non lascia un documento a metà
    # al posto di quello buono.
    temporaneo = dest_dir / f".{nome_file}.caricamento"
    try:
        with temporaneo.open("wb") as out:
            shutil.copyfileobj(file.file, out, length=8 * 1024 * 1024)
        temporaneo.replace(dest)
    finally:
        temporaneo.unlink(missing_ok=True)

    with get_conn() as con:
        con.execute(
            "INSERT INTO documenti (gara_slug, nome_file, percorso, categoria, caricato_il) VALUES (?,?,?,?,?)",
            (slug, nome_file, str(dest.relative_to(gara_dir(slug))), categoria, now()),
        )

    # Un upload a gara avviata non rilancia nulla da solo. Dopo la Fase 2
    # il documento si integra nel contesto (grafo, brief, domande) con
    # POST /documenti/integra, senza rieseguire le fasi; prima della Fase
    # 2 ci pensa la Fase 2 stessa, che censisce tutto input/.
    fasi = _leggi_json(gara_dir(slug) / "_state" / "fasi.json", {}).get("fasi", {})
    fasi_completate = sorted(
        int(k.split("_")[0]) for k, v in fasi.items() if v.get("stato") == "completata"
    )
    integrabile = _corpo_fase(fasi, 2).get("stato") == "completata"
    return {
        "caricato": nome_file,
        "categoria": categoria,
        "percorso": str(dest.relative_to(gara_dir(slug))),
        "fasi_completate_da_valutare": fasi_completate,
        "integrabile": integrabile,
        "messaggio": (
            "Documento caricato. Il grafo esiste già: integralo nel contesto (grafo, brief, domande) "
            "senza rieseguire le fasi."
            if integrabile else
            "Documento caricato. Entrerà nel contesto con la Fase 2 (analisi degli elaborati)."
        ),
    }


def _stato_contesto(d: Path, slug: str, righe) -> dict:
    """Per ogni percorso: se il documento è già nel contesto della gara.
    - "fase": l'ha (o lo avrà) letto la Fase 2, perché c'era quando è partita;
    - "da_integrare": caricato dopo l'avvio della Fase 2, non ancora integrato;
    - "in_coda" / "in_corso" / "integrato" / "errore": integrazione fuori fase."""
    fasi = _leggi_json(d / "_state" / "fasi.json", {}).get("fasi", {})
    f2 = _corpo_fase(fasi, 2)
    avvio_f2 = f2.get("iniziata_il") or ""
    integrazioni = _leggi_json(d / "_state" / "integrazioni.json", {})
    with get_conn() as con:
        job = {r["argomento"]: r["stato"] for r in con.execute(
            "SELECT argomento, stato FROM job WHERE gara_slug=? AND operazione='integra_documento' "
            "AND stato IN ('in_coda','in_esecuzione') ORDER BY id", (slug,)).fetchall()}
    out = {}
    for r in righe:
        percorso = r["percorso"]
        if percorso in job:
            out[percorso] = "in_corso" if job[percorso] == "in_esecuzione" else "in_coda"
        elif percorso in integrazioni:
            out[percorso] = "integrato" if integrazioni[percorso].get("esito") == "completato" else "errore"
        elif f2.get("stato") == "completata" and avvio_f2 and r["caricato_il"] > avvio_f2:
            out[percorso] = "da_integrare"
        else:
            out[percorso] = "fase"
    return out


@router.get("/{slug}/documenti")
def elenco_documenti(slug: str):
    d = _gara_o_404(slug)
    with get_conn() as con:
        righe = con.execute(
            "SELECT nome_file, percorso, categoria, caricato_il FROM documenti "
            "WHERE gara_slug=? ORDER BY caricato_il DESC",
            (slug,),
        ).fetchall()
    contesto = _stato_contesto(d, slug, righe)
    integrazioni = _leggi_json(d / "_state" / "integrazioni.json", {})
    return [{**dict(r), "contesto": contesto.get(r["percorso"]),
             "errore_integrazione": (integrazioni.get(r["percorso"]) or {}).get("errore")} for r in righe]


@router.post("/{slug}/documenti/integra", status_code=202)
def integra_documento(slug: str, body: IntegraDocumentoRequest):
    """Integra nel contesto un documento caricato dopo la Fase 2: grafo,
    brief e registro delle domande, senza rieseguire le fasi
    (spada_integra.sh, eseguito dal worker come ogni altro job)."""
    d = _gara_o_404(slug)
    fasi = _leggi_json(d / "_state" / "fasi.json", {}).get("fasi", {})
    if _corpo_fase(fasi, 2).get("stato") != "completata":
        raise HTTPException(409, "Prima della Fase 2 non serve: il documento entra nel contesto con la Fase 2.")
    percorso = body.percorso.strip().lstrip("/")
    if not percorso.startswith("input/") or ".." in Path(percorso).parts:
        raise HTTPException(400, "Il percorso deve essere un file sotto input/.")
    if not (d / percorso).is_file():
        raise HTTPException(404, f"Documento non trovato: {percorso}")
    with get_conn() as con:
        if con.execute("SELECT 1 FROM job WHERE gara_slug=? AND operazione='integra_documento' AND argomento=? "
                       "AND stato IN ('in_coda','in_esecuzione')", (slug, percorso)).fetchone():
            raise HTTPException(409, "L'integrazione di questo documento è già in coda.")
    return _accoda_job(slug, 2, "esegui", operazione="integra_documento", argomento=percorso)


@router.post("/{slug}/brief/riallinea", status_code=202)
def riallinea_brief(slug: str):
    """Riporta il gara brief alle sezioni fisse del template corrente con
    quanto prodotto dalle fasi già eseguite, e registra le domande di
    quelle fasi (gare nate prima del registro unico delle domande)."""
    d = _gara_o_404(slug)
    fasi = _leggi_json(d / "_state" / "fasi.json", {}).get("fasi", {})
    if _corpo_fase(fasi, 2).get("stato") != "completata":
        raise HTTPException(409, "Il riallineamento serve dopo la Fase 2: prima, il brief lo scrive la Fase 1.")
    with get_conn() as con:
        if con.execute("SELECT 1 FROM job WHERE gara_slug=? AND operazione='riallinea_brief' "
                       "AND stato IN ('in_coda','in_esecuzione')", (slug,)).fetchone():
            raise HTTPException(409, "Il riallineamento del brief è già in coda.")
    return _accoda_job(slug, 2, "esegui", operazione="riallinea_brief")


NOMI_FASI_UI = {
    1: "Acquisizione documenti", 2: "Analisi elaborati", 3: "Analisi strategica",
    4: "Domande al professionista", 5: "Ricerca soluzioni", 6: "Revisione proposte",
    7: "Deliverables", 8: "Audit e consegna",
}


def _corpo_fase(fasi: dict, n: int) -> dict:
    return next((v for k, v in fasi.items() if k.startswith(f"{n}_")), {})


def _verifica_sequenza(d: Path, fase: int, tipo: str):
    """Ogni fase sblocca la successiva (stessa regola di
    Dominio.sbloccata nel frontend): si esegue la fase n solo con la n-1
    completata e, se è un checkpoint, approvata. I checkpoint di 6 e 8
    (senza agente) si approvano dopo la fase precedente. La Fase 4 si
    esegue (= invio delle risposte) solo con le indicazioni strategiche
    compilate: tono e una priorità per criterio."""
    fasi = _leggi_json(d / "_state" / "fasi.json", {}).get("fasi", {})

    def chiusa(n):
        c = _corpo_fase(fasi, n)
        return c.get("stato") == "completata" and not c.get("richiede_approvazione")

    if tipo == "approva":
        if fase not in (6, 8):
            raise HTTPException(400, f"La Fase {fase} non ha un checkpoint da approvare.")
        if not chiusa(fase - 1):
            raise HTTPException(409, f"Il checkpoint della Fase {fase} si sblocca al completamento della Fase {fase - 1} ({NOMI_FASI_UI[fase - 1]}).")
        return
    if fase > 1 and not chiusa(fase - 1):
        prec = _corpo_fase(fasi, fase - 1)
        motivo = ("quando approvi il checkpoint" if prec.get("richiede_approvazione")
                  else "al completamento")
        raise HTTPException(409, f"La Fase {fase} si sblocca {motivo} della Fase {fase - 1} ({NOMI_FASI_UI[fase - 1]}).")
    if fase == 4:
        mancanti = registro_domande.mancanti_per_invio(d)
        if mancanti:
            raise HTTPException(409, "Per inviare le risposte servono le indicazioni strategiche (manca: "
                                     f"{', '.join(mancanti[:5])}{'…' if len(mancanti) > 5 else ''}).")


def _accoda_job(slug: str, fase: int, tipo: str, deliverable_id: str | None = None,
                operazione: str | None = None, argomento: str | None = None):
    d = _gara_o_404(slug)
    if not (1 <= fase <= 8):
        raise HTTPException(400, "fase deve essere 1-8")
    if operazione is None:
        _verifica_sequenza(d, fase, tipo)
        # Un secondo clic su «Avvia» non deve accodare un secondo job: la
        # stessa fase (o lo stesso deliverable) eseguita due volte di fila
        # costa due volte e scrive due volte sugli stessi file.
        with get_conn() as con:
            doppio = con.execute(
                "SELECT stato FROM job WHERE gara_slug=? AND fase=? AND operazione IS NULL "
                "AND COALESCE(deliverable_id,'')=COALESCE(?,'') AND stato IN ('in_coda','in_esecuzione')",
                (slug, fase, deliverable_id)).fetchone()
        if doppio:
            cosa = f"Il deliverable {deliverable_id}" if deliverable_id else f"La Fase {fase}"
            raise HTTPException(409, f"{cosa} è già {'in esecuzione' if doppio['stato'] == 'in_esecuzione' else 'in coda'}: non serve avviarla di nuovo.")
    with get_conn() as con:
        cur = con.execute(
            "INSERT INTO job (gara_slug, fase, tipo, stato, creato_il, deliverable_id, operazione, argomento) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (slug, fase, tipo, "in_coda", now(), deliverable_id, operazione, argomento),
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


def _nessuna_fase_in_corso(slug: str):
    with get_conn() as con:
        if con.execute("SELECT 1 FROM job WHERE gara_slug=? AND stato='in_esecuzione'", (slug,)).fetchone():
            raise HTTPException(409, "Una fase è in esecuzione su questa gara: riprova a esecuzione conclusa.")


# ── Fase 4 — registro unico delle domande al professionista ─────────
# Le domande le registrano le Fasi 1-3 e le integrazioni
# (_pipeline/scripts/domande/domande.py); qui il professionista risponde
# e dà le indicazioni strategiche. Salvare NON invia: le risposte entrano
# nel contesto (memoria, grafo, brief) solo eseguendo la Fase 4.
def _stato_domande(d: Path) -> dict:
    try:
        dati = registro_domande.carica(d)
    except ValueError as e:
        raise HTTPException(500, str(e))
    criteri = registro_domande.criteri(d)
    # Una priorità per ogni criterio attivo, anche se la bozza non c'è ancora.
    per_id = {p["id"]: p for p in dati["indicazioni"].get("priorita", [])}
    dati["indicazioni"]["priorita"] = [
        per_id.get(c["id"], {"id": c["id"], "livello": "", "indicazione": ""}) for c in criteri]
    return {
        **dati,
        "criteri": criteri,
        "mancanti": registro_domande.mancanti_per_invio(d, dati),
        "da_inviare": [x["id"] for x in registro_domande.da_inviare(dati)],
        "etichette": {"categorie": registro_domande.ETICHETTA_CATEGORIA, "origini": registro_domande.ETICHETTA_ORIGINE},
    }


@router.get("/{slug}/domande")
def leggi_domande(slug: str):
    return _stato_domande(_gara_o_404(slug))


@router.put("/{slug}/domande")
def salva_domande(slug: str, body: BozzaDomandeRequest):
    d = _gara_o_404(slug)
    _nessuna_fase_in_corso(slug)
    try:
        registro_domande.salva_bozza(d, body.risposte, body.indicazioni.model_dump() if body.indicazioni else None)
    except registro_domande.DatiNonValidi as e:
        raise HTTPException(400, str(e))
    return _stato_domande(d)


@router.post("/{slug}/domande/informazioni", status_code=201)
def aggiungi_informazione(slug: str, body: InformazioneProfessionistaRequest):
    d = _gara_o_404(slug)
    _nessuna_fase_in_corso(slug)
    try:
        registro_domande.aggiungi_informazione(d, body.titolo, body.testo, body.criterio or None)
    except (registro_domande.DatiNonValidi, ValueError) as e:
        raise HTTPException(400, str(e))
    return _stato_domande(d)


@router.delete("/{slug}/domande/{id_domanda}")
def elimina_informazione(slug: str, id_domanda: str):
    d = _gara_o_404(slug)
    _nessuna_fase_in_corso(slug)
    try:
        registro_domande.elimina(d, id_domanda)
    except registro_domande.DatiNonValidi as e:
        raise HTTPException(400, str(e))
    return _stato_domande(d)


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
    return _accoda_job(slug, 7, "esegui", deliverable_id=deliverable_id)


@router.post("/{slug}/deliverables/{deliverable_id}/riesegui", status_code=202)
def riesegui_deliverable(slug: str, deliverable_id: str):
    _deliverable_o_404(slug, deliverable_id)
    return _accoda_job(slug, 7, "riesegui", deliverable_id=deliverable_id)


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
    # Gate globale, non per-gara: ogni `claude -p` (fase, deliverable o
    # intervento) è un processo pesante a sé — nato per l'e2-micro della
    # VM, tenuto in locale per non far girare insieme sessioni che
    # scrivono. Il worker già serializza le fasi (un job
    # alla volta, qualunque gara), ma /interventi bypassa la coda job
    # per design (risposta diretta, non accodata) — senza questo
    # controllo, un intervento su una gara e una fase in corso su
    # un'altra girerebbero insieme.
    with get_conn() as con:
        in_corso = con.execute(
            "SELECT 1 FROM job WHERE stato='in_esecuzione'"
        ).fetchone()
    if in_corso:
        raise HTTPException(409, "Una fase è in esecuzione (qualunque gara): riprova a conclusione.")

    with get_conn() as con:
        con.execute(
            "INSERT INTO interventi (gara_slug, ruolo, testo, creato_il) VALUES (?,?,?,?)",
            (slug, "utente", body.messaggio, now()),
        )

    try:
        esito = invoca_intervento(slug, body.messaggio)
    except InterventoGiaInCorso as e:
        raise HTTPException(409, str(e))
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
async def stream_stato(slug: str, request: Request):
    d = _gara_o_404(slug)

    async def generatore():
        # Senza questo controllo il ciclo non finisce mai finché il
        # CLIENT non si disconnette — utile (chiusura di un tab), ma non
        # basta da solo: un SIGTERM del server (restart del servizio)
        # non genera un evento "client disconnesso" finché il client
        # resta connesso, quindi questo ciclo può restare vivo oltre il
        # riavvio comunque. La garanzia vera che il processo muoia entro
        # un tempo limitato — e quindi rilasci la porta 8000 — è
        # TimeoutStopSec+KillMode nel systemd unit (spada-api.service),
        # non questo controllo da solo. Bug reale osservato in
        # produzione: VM esaurita da un loop di 47.000+ riavvii perché
        # nessuno dei due meccanismi esisteva.
        ultimo = None
        ultimo_invio = asyncio.get_event_loop().time()
        while not await request.is_disconnected():
            fasi = _fasi_con_job(d, slug)
            attivita = _leggi_json(d / "_state" / "attivita.json", {})
            payload = json.dumps({"fasi": fasi, "attivita": attivita}, ensure_ascii=False)
            ora = asyncio.get_event_loop().time()
            if payload != ultimo:
                yield f"data: {payload}\n\n"
                ultimo = payload
                ultimo_invio = ora
            elif ora - ultimo_invio > 20:
                # Nessun cambio di stato da 20s: senza mandare nulla la
                # connessione risulta "idle" a Cloudflare Tunnel, che la
                # chiude — il client lo vede come riconnessione SSE visibile
                # ogni 1-2 minuti (badge che sfarfalla, redraw). Un commento
                # SSE (riga che inizia per ":") è ignorato da EventSource,
                # non tocca payload/onmessage: serve solo a tenere viva la
                # connessione.
                yield ": keep-alive\n\n"
                ultimo_invio = ora
            await asyncio.sleep(1.0)

    return StreamingResponse(generatore(), media_type="text/event-stream")
