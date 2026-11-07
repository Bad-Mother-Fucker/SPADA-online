"""Dettaglio di una proposta letto dalla scheda del criterio (Fase 5).

Prima della conferma della Fase 6 una proposta non è ancora un nodo in
02_graph/proposals/: vive in output/05_criteria_outputs/Cx_output.md,
sezione «#### P-Cx-nnn — titolo» dentro «## 4. Proposte», con le prove
in «## 6. Evidenze in dettaglio» («### E-Cx-nnn — fonte» + citazione).
Qui si ricava la stessa forma del nodo ({frontmatter, corpo}) perché la
revisione possa leggere testo integrale e prove prima di decidere.
"""
from __future__ import annotations

import re
from pathlib import Path

RE_TITOLO = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
RE_EVIDENZA = re.compile(r"\bE-C[0-9]+-[0-9]+\b")
RE_ANCORA = re.compile(r"\[([^\]]+)\]\(#[^)]*\)")  # link interni alla scheda: restano solo l'etichetta
RE_DETAILS = re.compile(r"<details>.*?</details>\s*", re.S)


def _sezioni(righe: list[str]) -> list[tuple[int, str, int, int]]:
    """(livello, titolo, riga di inizio, riga di fine esclusa) per ogni titolo."""
    titoli = [(i, len(m.group(1)), m.group(2)) for i, r in enumerate(righe) if (m := RE_TITOLO.match(r))]
    out = []
    for k, (i, liv, tit) in enumerate(titoli):
        fine = next((j for j, l2, _ in titoli[k + 1:] if l2 <= liv), len(righe))
        out.append((liv, tit, i, fine))
    return out


def _citazione(blocco: list[str]) -> str:
    q = [r.lstrip()[1:].strip() for r in blocco if r.lstrip().startswith(">")]
    testo = " ".join(q) if q else " ".join(r.strip() for r in blocco if r.strip() and not r.startswith("**"))
    return RE_ANCORA.sub(r"\1", testo).strip()


def dettaglio_da_output(gara: Path, proposta_id: str) -> dict | None:
    criterio = proposta_id.split("-")[1]  # P-C1-001 -> C1
    f = gara / "output" / "05_criteria_outputs" / f"{criterio}_output.md"
    if not f.exists():
        return None
    righe = f.read_text(encoding="utf-8").splitlines()
    sezioni = _sezioni(righe)

    proposta = next((s for s in sezioni if s[0] == 4 and s[1].split(" ")[0] == proposta_id), None)
    if proposta is None:
        return None
    _, titolo_riga, inizio, fine = proposta
    titolo = titolo_riga.split("—", 1)[1].strip() if "—" in titolo_riga else titolo_riga
    sottocriterio = next((t.removeprefix("Sottocriterio ").strip() for liv, t, i, e in sezioni
                          if liv == 3 and t.startswith("Sottocriterio") and i < inizio < e), "")

    testo = "\n".join(righe[inizio + 1:fine])
    ids_evidenze = list(dict.fromkeys(RE_EVIDENZA.findall(testo)))
    audit = re.search(r"^\*\*Audit:\*\*\s*(.+)$", testo, re.M)
    corpo = RE_DETAILS.sub("", testo)
    # Campi vuoti per il feedback in markdown: in app la decisione si prende a lato.
    corpo = re.sub(r"^\*\*(Decisione|Note):\*\*\s*$", "", corpo, flags=re.M)
    corpo = RE_ANCORA.sub(r"\1", corpo).strip()

    evidenze_sez = {t.split(" ")[0]: (t, i, e) for liv, t, i, e in sezioni if liv == 3 and RE_EVIDENZA.match(t)}
    evidenze = []
    for eid in ids_evidenze:
        if eid not in evidenze_sez:
            continue
        t, i, e = evidenze_sez[eid]
        fonte = t.split("—", 1)[1].strip() if "—" in t else t
        fonte = re.sub(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", lambda m: m.group(2) or m.group(1), fonte)
        evidenze.append({"doc": f"{eid} · {fonte}", "estratto": _citazione(righe[i + 1:e])})

    return {
        "fonte": "output_criterio",
        "frontmatter": {
            "titolo": titolo,
            "criterio": criterio,
            "sottocriterio": sottocriterio,
            "audit": audit.group(1).split("—", 1)[0].strip() if audit else "",
            "evidence_documents": evidenze,
        },
        "corpo": corpo,
    }
