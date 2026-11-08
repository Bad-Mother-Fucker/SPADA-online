"""deliverables.py — i deliverable dell'offerta come documenti interi.

manifest.json → deliverables elenca, per criterio, i documenti richiesti
dal disciplinare; lo stesso documento (stessa fonte, es. la relazione
tecnica) si ripete sotto ogni criterio. Il raggruppamento in un documento
per deliverable, gli stadi (scaletta → bozza → definitivo per la
relazione, voci → bozza → definitivo per il computo) e il loro stato
stanno in _pipeline/scripts/setup/deliverables_offerta.py, condiviso con
spada_deliverable.sh.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_pipeline" / "scripts" / "setup"))
import deliverables_offerta as offerta  # noqa: E402

AGENTE_PER_TIPO = offerta.AGENTE_PER_TIPO


def _manifest(gara_dir: Path) -> dict:
    return offerta._leggi(gara_dir / "manifest.json", {})


def elenca_deliverables(gara_dir: Path) -> list[dict]:
    out = []
    for dl in offerta.raggruppa(_manifest(gara_dir)):
        st = offerta.stato_deliverable(gara_dir, dl)
        cartella = gara_dir / dl["cartella"]
        esportazioni = {fmt: f"{dl['cartella'].removeprefix('output/')}/{f.name}"
                        for fmt in ("docx", "pdf") for f in sorted(cartella.glob(f"*.{fmt}"))[:1]}
        out.append({
            "id": dl["id"], "nome": dl["nome"], "tipo": dl["tipo"], "agente": dl["agente"], "skill": dl["skill"],
            "fonte": dl["fonte"], "vincolo_formato": dl["vincolo_formato"], "criteri": dl["criteri"],
            "trasversale": dl["trasversale"], "criterio": ", ".join(dl["criteri"]),
            "cartella": dl["cartella"].removeprefix("output/"),
            "stato": st["stato"], "stadi": st["stadi"], "nota": st["nota"], "errore": st["errore"],
            "esportazioni": esportazioni,
            # CME completo: versioni chieste dal disciplinare che il professionista ricava in PriMus.
            "derivate": dl.get("derivate", []),
        })
    return out


def trova_deliverable(gara_dir: Path, deliverable_id: str) -> dict | None:
    return offerta.trova(_manifest(gara_dir), deliverable_id)
