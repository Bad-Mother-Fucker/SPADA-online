"""Validazione di slug e percorsi (Sprint 4.5): nessun input utente
deve poter uscire da `gare/`.
"""
import os
import re
from pathlib import Path

SLUG_RE = re.compile(r"^[a-z0-9-]{1,64}$")

GARE_DIR = Path(os.environ.get("SPADA_GARE_DIR", os.path.expanduser("~/spada/gare"))).resolve()
PIPELINE_DIR = Path(os.environ.get("SPADA_PIPELINE_DIR", os.path.expanduser("~/spada/_pipeline"))).resolve()
DATA_DIR = Path(os.environ.get("SPADA_DATA_DIR", os.path.expanduser("~/spada/_data"))).resolve()
DB_PATH = Path(os.environ.get("SPADA_DB_PATH", str(DATA_DIR / "spada.db")))


class SlugNonValido(ValueError):
    pass


def valida_slug(slug: str) -> str:
    """Ritorna lo slug se valido, altrimenti solleva SlugNonValido.

    Un pattern rigoroso (minuscole/cifre/trattini) basta di per sé a
    escludere `..` e `/`, ma il controllo di containment sotto è la
    difesa che conta davvero: se in futuro il pattern si allarga, un
    path traversal resta comunque impossibile.
    """
    if not SLUG_RE.match(slug or ""):
        raise SlugNonValido(f"slug non valido: {slug!r} (solo minuscole, cifre, trattini)")
    return slug


def gara_dir(slug: str) -> Path:
    valida_slug(slug)
    candidato = (GARE_DIR / slug).resolve()
    if candidato.parent != GARE_DIR:
        raise SlugNonValido(f"percorso risultante fuori da {GARE_DIR}: {candidato}")
    return candidato


def percorso_sotto_gara(slug: str, *parti: str) -> Path:
    """Risolve un percorso relativo alla gara, garantendo che resti
    sotto la sua directory anche se `parti` contiene `..` annidati."""
    base = gara_dir(slug)
    candidato = base.joinpath(*parti).resolve()
    if base not in candidato.parents and candidato != base:
        raise SlugNonValido(f"percorso fuori dalla gara {slug}: {candidato}")
    return candidato
