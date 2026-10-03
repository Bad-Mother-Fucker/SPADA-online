"""Risposte del professionista alle "Domande aperte" del gara brief.

Stesse meccaniche delle indicazioni strategiche (strategia.py): si legge e
si riscrive SOLO la sezione "## Domande aperte per il professionista" di
`output/03_criteria/gara_brief.md`, con ogni risposta sotto la sua domanda:

    1. Testo della domanda…
       **Risposta:** testo della risposta

Le risposte arrivano alle fasi successive tramite `_state/memoria.md`
(ogni fase la riceve nel prompt), e restano anche in
`_state/risposte_gara_brief.json`: se la Fase 1 riscrive il brief, le
risposte alle domande rimaste identiche si ritrovano da sole.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from md_sezioni import RE_HR, scrivi_atomico, sezioni_h2, vuoto

RE_ITEM = re.compile(r"^(\d+)[.)]\s+(.*)$")
RE_RISPOSTA = re.compile(r"^\*\*Risposta:?\*\*:?\s*(.*)$", re.IGNORECASE)
TITOLO_MEMORIA = "## Risposte alle domande aperte del gara brief"


def _percorso(gara_dir: Path) -> Path:
    return gara_dir / "output" / "03_criteria" / "gara_brief.md"


def _archivio(gara_dir: Path) -> Path:
    return gara_dir / "_state" / "risposte_gara_brief.json"


def _chiave(domanda: str) -> str:
    """Domanda normalizzata: confronto tollerante a formattazione e spazi."""
    t = re.sub(r"[*_`\[\]]", "", domanda or "").lower()
    return " ".join(t.split())


def _sezione(righe, sezioni):
    return next(((i, f) for t, i, f in sezioni if t.lower().startswith("domande aperte")), None)


def _analizza(corpo):
    """(intro, voci, coda): le righe prima dell'elenco, le domande con le
    risposte, e ciò che segue l'elenco (separatore, note)."""
    intro, voci, coda = [], [], []
    corrente, in_risposta = None, False
    for k, r in enumerate(corpo):
        if RE_HR.match(r) and voci:
            coda = corpo[k:]
            break
        m = RE_ITEM.match(r)
        if m:
            corrente = {"domanda": m.group(2).strip(), "risposta": []}
            voci.append(corrente)
            in_risposta = False
            continue
        if corrente is None:
            intro.append(r)
            continue
        s = r.strip()
        if not s:
            continue
        mr = RE_RISPOSTA.match(s)
        if mr:
            in_risposta = True
            corrente["risposta"].append(mr.group(1))
        elif in_risposta:
            corrente["risposta"].append(s)
        elif not r.startswith((" ", "\t")) and s.startswith((">", "#")):
            coda = corpo[k:]
            break
        else:
            corrente["domanda"] += " " + s
    for v in voci:
        v["risposta"] = vuoto("\n".join(v["risposta"]).strip())
    while intro and not intro[-1].strip():
        intro.pop()
    return intro, voci, coda


def _leggi_archivio(gara_dir: Path) -> dict:
    try:
        return json.loads(_archivio(gara_dir).read_text(encoding="utf-8")).get("risposte", {})
    except Exception:
        return {}


def leggi(gara_dir: Path) -> dict:
    p = _percorso(gara_dir)
    if not p.exists():
        return {"disponibile": False}
    righe, sezioni = sezioni_h2(p.read_text(encoding="utf-8"))
    sez = _sezione(righe, sezioni)
    if not sez:
        return {"disponibile": True, "sezione_presente": False, "domande": [], "risposte": [], "recuperate": []}
    _, voci, _ = _analizza(righe[sez[0] + 1:sez[1]])
    archivio = _leggi_archivio(gara_dir)
    risposte, recuperate = [], []
    for k, v in enumerate(voci):
        r = v["risposta"]
        if not r:
            precedente = (archivio.get(_chiave(v["domanda"])) or {}).get("risposta", "")
            if precedente:
                r = precedente
                recuperate.append(k)
        risposte.append(r)
    return {
        "disponibile": True,
        "sezione_presente": True,
        "domande": [v["domanda"] for v in voci],
        "risposte": risposte,
        # Risposte riprese dall'archivio perché il brief è stato riscritto:
        # tornano nel documento al prossimo salvataggio.
        "recuperate": recuperate,
    }


def _rientra(testo: str) -> list[str]:
    """Risposta su più righe come continuazione della voce d'elenco."""
    righe = [x.rstrip() for x in testo.strip().split("\n")]
    out = [f"   **Risposta:** {righe[0]}"]
    out += [f"   {x}" if x.strip() else "" for x in righe[1:]]
    return out


def scrivi(gara_dir: Path, risposte: list[str]) -> dict:
    p = _percorso(gara_dir)
    if not p.exists():
        raise ValueError("gara_brief.md non esiste ancora: esegui prima la Fase 1.")
    righe, sezioni = sezioni_h2(p.read_text(encoding="utf-8"))
    sez = _sezione(righe, sezioni)
    if not sez:
        raise ValueError("Il gara brief non ha una sezione «Domande aperte per il professionista».")
    intro, voci, coda = _analizza(righe[sez[0] + 1:sez[1]])
    if len(risposte) > len(voci):
        raise ValueError(f"Ricevute {len(risposte)} risposte per {len(voci)} domande.")

    nuova = [righe[sez[0]]] + intro + [""]
    for k, v in enumerate(voci):
        nuova.append(f"{k + 1}. {v['domanda']}")
        r = (risposte[k] if k < len(risposte) else "").strip()
        if r:
            nuova += _rientra(r)
        nuova.append("")
    if coda:
        nuova += coda
    righe = righe[:sez[0]] + nuova + righe[sez[1]:]
    scrivi_atomico(p, "\n".join(righe))

    # Archivio per domanda (sopravvive a una riscrittura del brief).
    ora = datetime.now(timezone.utc).isoformat()
    archivio = _leggi_archivio(gara_dir)
    for k, v in enumerate(voci):
        r = (risposte[k] if k < len(risposte) else "").strip()
        chiave = _chiave(v["domanda"])
        if r:
            archivio[chiave] = {"domanda": v["domanda"], "risposta": r, "aggiornata_il": ora}
        else:
            archivio.pop(chiave, None)
    _archivio(gara_dir).parent.mkdir(parents=True, exist_ok=True)
    _archivio(gara_dir).write_text(json.dumps({"risposte": archivio}, ensure_ascii=False, indent=2), encoding="utf-8")

    _aggiorna_memoria(gara_dir, [(v["domanda"], (risposte[k] if k < len(risposte) else "").strip()) for k, v in enumerate(voci)])
    return leggi(gara_dir)


def _aggiorna_memoria(gara_dir: Path, coppie):
    """Un solo paragrafo in memoria.md, rimpiazzato a ogni salvataggio."""
    m_path = gara_dir / "_state" / "memoria.md"
    memoria = m_path.read_text(encoding="utf-8") if m_path.exists() else ""
    memoria = re.sub(rf"\n{re.escape(TITOLO_MEMORIA)}.*?(?=\n## |\Z)", "", memoria, flags=re.DOTALL)
    risposte = [(d, r) for d, r in coppie if r]
    if risposte:
        paragrafo = [f"\n{TITOLO_MEMORIA}\n",
                     f"Aggiornate il {datetime.now().strftime('%d/%m/%Y')}. Fonte: `output/03_criteria/gara_brief.md`.\n"]
        for d, r in risposte:
            paragrafo.append(f"- **D:** {' '.join(d.split())}\n  **R:** {' '.join(r.split())}")
        memoria = memoria.rstrip("\n") + "\n" + "\n".join(paragrafo)
    m_path.parent.mkdir(parents=True, exist_ok=True)
    m_path.write_text(memoria.rstrip("\n") + "\n", encoding="utf-8")
