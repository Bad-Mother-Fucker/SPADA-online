"""grafo.py — estrae nodi e archi dal knowledge graph di una gara
(02_graph/) in una forma strutturata (JSON), per il grafo visuale del
frontend (Sprint 10.1).

Legge il frontmatter YAML delle pagine nodo secondo lo schema canonico
in _pipeline/graph-schema.md (supports_criteria, related_documents,
supported_by, evidence_documents, ecc.) — non re-inventa un formato,
usa quello già scritto da graph-builder/feedback-processor.

Regola anti-fabbricazione, coerente col resto del sistema: se un file
non ha frontmatter valido, viene incluso come nodo "senza dati" (mai
scartato in silenzio) e segnalato in `nodi_senza_frontmatter`.
"""
import re
from pathlib import Path

import yaml

WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")


def _strip_wikilink(value):
    if not isinstance(value, str):
        return value
    m = WIKILINK_RE.search(value)
    return m.group(1) if m else value


def leggi_frontmatter(path: Path):
    """Ritorna (meta, ok). ok=False se il file non ha frontmatter YAML valido."""
    try:
        testo = path.read_text(encoding="utf-8")
    except Exception:
        return {}, False
    m = re.match(r"^---\n(.*?)\n---\n", testo, re.DOTALL)
    if not m:
        return {}, False
    try:
        meta = yaml.safe_load(m.group(1)) or {}
        return meta, True
    except yaml.YAMLError:
        return {}, False


def leggi_corpo(path: Path) -> str:
    """Testo del file dopo il frontmatter (o l'intero file se non ne ha
    uno) — per la vista dettaglio proposta del frontend (Sprint 10.1)."""
    try:
        testo = path.read_text(encoding="utf-8")
    except Exception:
        return ""
    m = re.match(r"^---\n.*?\n---\n(.*)$", testo, re.DOTALL)
    return m.group(1).strip() if m else testo.strip()


def _nodo_documento(codice, meta):
    return {
        "id": codice,
        "tipo": "document",
        "sottotipo": meta.get("subtype", "TBD"),
        "etichetta": f"{meta.get('codice', codice)} — {meta.get('subtype', '')}".strip(" —"),
        "stato": meta.get("status", "TBD"),
        "confidence": meta.get("confidence", "TBD"),
        "is_latest": meta.get("is_latest", True),
    }


def _nodo_criterio(codice, meta):
    return {
        "id": codice,
        "tipo": "criterion",
        "etichetta": meta.get("titolo") or codice,
        "confidence": meta.get("confidence", "TBD"),
    }


def _nodo_proposta(codice, meta):
    return {
        "id": codice,
        "tipo": "proposal",
        "etichetta": f"{codice} — {meta.get('titolo', '')}".strip(" —"),
        "stato": meta.get("stato", "TBD"),
        "confidence": meta.get("confidence", "TBD"),
    }


def estrai_grafo(gara_dir: Path) -> dict:
    graph_dir = gara_dir / "02_graph"
    nodi = {}
    archi = []
    nodi_senza_frontmatter = []

    def aggiungi_arco(da, a, tipo, extra=None):
        if not da or not a:
            return
        arco = {"da": da, "a": a, "tipo": tipo}
        if extra:
            arco.update(extra)
        archi.append(arco)

    # ── Nodi documento ────────────────────────────────────────────
    nodes_dir = graph_dir / "nodes"
    if nodes_dir.exists():
        for f in sorted(nodes_dir.glob("*.md")):
            codice = f.stem
            meta, ok = leggi_frontmatter(f)
            if not ok:
                nodi_senza_frontmatter.append(codice)
                nodi[codice] = {"id": codice, "tipo": "document", "sottotipo": "TBD",
                                 "etichetta": codice, "stato": "TBD", "confidence": "TBD"}
                continue
            nodi[codice] = _nodo_documento(codice, meta)

            for sc in meta.get("supports_criteria") or []:
                crit = _strip_wikilink(sc.get("criterion"))
                aggiungi_arco(codice, crit, "supports_criteria",
                              {"priorita": sc.get("priority"), "motivo": sc.get("reason")})

            for rd in meta.get("related_documents") or []:
                target = _strip_wikilink(rd.get("doc"))
                aggiungi_arco(codice, target, rd.get("type", "references"),
                              {"motivo": rd.get("reason")})

    # ── Nodi criterio (da 03_criteria/criteria/, arricchiti da graph-builder) ─
    criteria_dir = gara_dir / "output" / "03_criteria" / "criteria"
    if criteria_dir.exists():
        for f in sorted(criteria_dir.glob("criterion_*.md")):
            codice = f.stem.replace("criterion_", "")
            meta, ok = leggi_frontmatter(f)
            if not ok:
                nodi_senza_frontmatter.append(codice)
                nodi.setdefault(codice, {"id": codice, "tipo": "criterion", "etichetta": codice, "confidence": "TBD"})
                continue
            nodi[codice] = _nodo_criterio(codice, meta)
            for sb in meta.get("supported_by") or []:
                doc = _strip_wikilink(sb.get("doc"))
                aggiungi_arco(codice, doc, "supported_by", {"priorita": sb.get("priority")})

    # ── Nodi proposta (02_graph/proposals/) ──────────────────────
    proposals_dir = graph_dir / "proposals"
    if proposals_dir.exists():
        for f in sorted(proposals_dir.glob("*.md")):
            meta, ok = leggi_frontmatter(f)
            codice = meta.get("id") if ok else f.stem
            if not ok:
                nodi_senza_frontmatter.append(codice)
                nodi.setdefault(codice, {"id": codice, "tipo": "proposal", "etichetta": codice, "stato": "TBD"})
                continue
            nodi[codice] = _nodo_proposta(codice, meta)
            crit = _strip_wikilink(meta.get("criterio"))
            aggiungi_arco(codice, crit, "criterio_di")
            for ev in meta.get("evidence_documents") or []:
                doc = _strip_wikilink(ev.get("doc"))
                aggiungi_arco(codice, doc, "evidenza", {"sezione": ev.get("sezione")})

    # ── Pagine speciali: scope, economic_framework ───────────────
    for nome, tipo in (("scope", "scope"), ("economic_framework", "economic_framework")):
        f = graph_dir / f"{nome}.md"
        if not f.exists():
            continue
        meta, ok = leggi_frontmatter(f)
        if not ok:
            continue
        nodi[nome] = {"id": nome, "tipo": tipo, "etichetta": nome, "confidence": meta.get("confidence", "TBD")}
        for campo in ("fonte_lavorazioni", "fonte_qe"):
            if campo in meta:
                aggiungi_arco(nome, _strip_wikilink(meta[campo]), "fonte")
        for campo in ("fonte_vincoli", "fonte_sicurezza"):
            for v in meta.get(campo) or []:
                aggiungi_arco(nome, _strip_wikilink(v), "fonte")

    # Archi verso nodi non censiti (es. criterio non ancora creato come pagina)
    # restano nell'elenco: il frontend li mostra come nodo minimale "TBD".
    id_noti = set(nodi.keys())
    for arco in archi:
        for chiave in ("da", "a"):
            rid = arco[chiave]
            if rid not in id_noti:
                nodi[rid] = {"id": rid, "tipo": "sconosciuto", "etichetta": rid, "confidence": "TBD"}
                id_noti.add(rid)

    collegati = {a["da"] for a in archi} | {a["a"] for a in archi}
    orfani = [nid for nid in nodi if nid not in collegati]

    return {
        "nodi": list(nodi.values()),
        "archi": archi,
        "orfani": orfani,
        "nodi_senza_frontmatter": nodi_senza_frontmatter,
    }
