"""deliverables.py — Sprint 10.3: i deliverable richiesti dal
disciplinare (manifest.json → deliverables, scritto da
disciplinare-analyst) come workspace separati, ciascuno eseguibile
indipendentemente da un agente dedicato al tipo di documento.

manifest.json resta il "cosa" (nome, vincolo_formato, fonte, tipo);
_state/deliverables.json è il "come va" (stato di esecuzione), stesso
principio di fasi.json rispetto al manifest — mai stato di esecuzione
dentro manifest.json.
"""
import json
from pathlib import Path

# tipo (assegnato da disciplinare-analyst) → agente dedicato e cartella
# comandi. "relazione_tecnica" riusa offer-writer (Sprint 6) invariato:
# stesso output di sempre in output/10_offer/*.md|docx, nessuna rottura
# di compatibilità. Gli altri quattro sono nuovi (Sprint 10.3).
AGENTE_PER_TIPO = {
    "relazione_tecnica": "offer-writer",
    "computo_metrico": "deliverable-computo-metrico",
    "legge_10": "deliverable-legge-10",
    "cronoprogramma": "deliverable-cronoprogramma",
    "tavole_tecniche": "deliverable-tavole-tecniche",
    "altro": "deliverable-generico",
}

STATO_DEFAULT = {"stato": "da_eseguire"}


def _leggi_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def elenca_deliverables(gara_dir: Path) -> list[dict]:
    """Appiattisce manifest.json → deliverables (dict per criterio) in
    una lista con id stabile `{criterio}-{indice}` e lo stato corrente
    da _state/deliverables.json (default 'da_eseguire' se non presente:
    un deliverable appena scritto da disciplinare-analyst non ha ancora
    uno stato registrato, non è un errore)."""
    manifest = _leggi_json(gara_dir / "manifest.json", {})
    stato = _leggi_json(gara_dir / "_state" / "deliverables.json", {})

    risultato = []
    for criterio, voci in (manifest.get("deliverables") or {}).items():
        for i, voce in enumerate(voci):
            deliverable_id = f"{criterio}-{i}"
            tipo = voce.get("tipo", "altro")
            risultato.append({
                "id": deliverable_id,
                "criterio": criterio,
                "nome": voce.get("nome", ""),
                "vincolo_formato": voce.get("vincolo_formato", ""),
                "fonte": voce.get("fonte", ""),
                "tipo": tipo,
                "agente": AGENTE_PER_TIPO.get(tipo, "deliverable-generico"),
                **STATO_DEFAULT,
                **stato.get(deliverable_id, {}),
            })
    return risultato


def trova_deliverable(gara_dir: Path, deliverable_id: str) -> dict | None:
    for d in elenca_deliverables(gara_dir):
        if d["id"] == deliverable_id:
            return d
    return None


def percorso_output(gara_dir: Path, deliverable: dict) -> Path:
    """relazione_tecnica mantiene il percorso storico (output/10_offer/,
    invariato da Sprint 6): un solo deliverable di questo tipo per gara
    nella pratica, e riscrivere offer-writer per un sotto-percorso non
    è nello scope di questo sprint. Gli altri tipi usano una cartella
    per deliverable_id: possono essercene più di uno (es. computo
    metrico per più criteri) e non devono sovrascriversi a vicenda."""
    if deliverable["tipo"] == "relazione_tecnica":
        return gara_dir / "output" / "10_offer"
    return gara_dir / "output" / "10_offer" / deliverable["id"]
