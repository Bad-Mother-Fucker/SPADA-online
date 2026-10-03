"""Lettura per sezioni dei documenti markdown della pipeline (audit
strategico, gara brief): i moduli dell'interfaccia riscrivono UNA
sezione e lasciano il resto del file com'è.
"""
import re

RE_SEGNAPOSTO = re.compile(r"^\[[^\]]*\]$")
RE_HR = re.compile(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$")


def vuoto(v: str) -> str:
    """Il valore, o "" se è un segnaposto del template ([risposta], TBD...)."""
    v = (v or "").strip()
    return "" if not v or RE_SEGNAPOSTO.match(v) or v.lower() in ("[da compilare]", "tbd") else v


def sezioni_h2(testo: str):
    """(righe, [(titolo, inizio, fine)]) per ogni sezione ##, fine esclusa."""
    righe = testo.split("\n")
    inizi = [i for i, r in enumerate(righe) if re.match(r"^##\s+\S", r)]
    out = []
    for k, i in enumerate(inizi):
        fine = inizi[k + 1] if k + 1 < len(inizi) else len(righe)
        out.append((righe[i][2:].strip(), i, fine))
    return righe, out


def scrivi_atomico(percorso, testo: str):
    """Su un file temporaneo accanto, poi rinominato: un'interruzione non
    lascia mai il documento a metà."""
    temporaneo = percorso.with_suffix(percorso.suffix + ".salvataggio")
    temporaneo.write_text(testo.rstrip("\n") + "\n", encoding="utf-8")
    temporaneo.replace(percorso)
