"""Indicazioni strategiche del professionista (checkpoint della Fase 3).

`strategy-auditor` chiude `output/03_criteria/strategy_audit.md` con la
sezione "## Indicazioni strategiche del professionista" precompilata a
segnaposto (template in _pipeline/skills/strategy-audit/SKILL.md). La
compila il professionista; la Fase 3 si approva solo dopo
(_pipeline/comandi/fasi/3_analisi_strategica.md). A valle la leggono
criterion-agent ("cornice strategica" delle proposte) e offer-writer
(priorità per criterio → budget facciate).

Qui si legge e si riscrive SOLO quella sezione, nel formato del template,
lasciando intatto il resto del documento. All'approvazione le indicazioni
finiscono anche in _state/memoria.md e nell'handoff della Fase 3, che le
fasi successive ricevono nel prompt.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from md_sezioni import RE_HR, scrivi_atomico, sezioni_h2 as _sezioni_h2, vuoto as _vuoto

TITOLO_SEZIONE = "## Indicazioni strategiche del professionista"
TONI = ("conservativo", "bilanciato", "audace")
LIVELLI = ("ALTA", "MEDIA", "BASSA")
PREFISSO_HANDOFF = "[Indicazioni del professionista]"

RE_VOCE_NUM = re.compile(r"^\s*(\d+)[.)]\s+(.*)$")
RE_VOCE = re.compile(r"^\s*[-*+]\s+(.*)$")
RE_ETICHETTA = re.compile(r"^\s*(?:[-*+]\s*)?\*{0,2}([^:*]+?)\*{0,2}\s*(?:\([^)]*\))?\s*:\*{0,2}\s*(.*)$")


class IndicazioniNonValide(ValueError):
    pass


def _percorso(gara_dir: Path) -> Path:
    return gara_dir / "output" / "03_criteria" / "strategy_audit.md"


def _elenco(righe):
    """Voci di un elenco (numerato o puntato), con le righe a capo unite."""
    voci = []
    for r in righe:
        m = RE_VOCE_NUM.match(r) or RE_VOCE.match(r)
        if m:
            voci.append(m.group(m.lastindex).strip())
        elif RE_HR.match(r):
            break  # separatore: l'elenco è finito
        elif voci and r.strip() and not r.lstrip().startswith(("#", ">", "**")):
            voci[-1] += " " + r.strip()
        elif voci and not r.strip():
            continue
    return voci


def _domande(righe, sezioni) -> list[str]:
    for titolo, i, f in sezioni:
        if titolo.lower().startswith("domande chiave"):
            return _elenco(righe[i + 1:f])
    return []


def _blocchi_etichettati(righe):
    """Dentro le Direttive: {etichetta_normalizzata: [righe]} per i blocchi
    «**Etichetta:** valore» seguiti da eventuali voci di elenco."""
    blocchi, corrente = {}, None
    for r in righe:
        if r.startswith("#"):
            corrente = None
            continue
        m = RE_ETICHETTA.match(r)
        if m and ("**" in r or r.lstrip().startswith("- ")) and _chiave(m.group(1)):
            corrente = _chiave(m.group(1))
            blocchi[corrente] = [m.group(2)] if m.group(2).strip() else []
            continue
        if corrente:
            blocchi[corrente].append(r)
    return blocchi


def _chiave(etichetta: str):
    e = etichetta.lower()
    if e.startswith("tono"):
        return "tono"
    if e.startswith("priorit"):
        return "priorita"
    if e.startswith("vincoli"):
        return "vincoli"
    if e.startswith("opportunit"):
        return "opportunita"
    if e.startswith("note"):
        return "note"
    return None


def _criteri_da_file(gara_dir: Path):
    """Ripiego se la sezione non elenca i criteri: le pagine criterio."""
    out = []
    cartella = gara_dir / "output" / "03_criteria" / "criteria"
    for f in sorted(cartella.glob("criterion_C*.md"), key=lambda p: int(re.sub(r"\D", "", p.stem) or 0)):
        cid = f.stem.replace("criterion_", "")
        titolo = ""
        m = re.search(r"^titolo:\s*(.+)$", f.read_text(encoding="utf-8"), re.MULTILINE)
        if m:
            titolo = m.group(1).strip().strip('"')
        out.append({"id": cid, "etichetta": f"{cid} — {titolo}" if titolo else cid})
    return out


def leggi(gara_dir: Path) -> dict:
    """Stato delle indicazioni: domande, criteri, valori attuali, se la
    sezione è compilata e cosa manca."""
    p = _percorso(gara_dir)
    if not p.exists():
        return {"disponibile": False}
    testo = p.read_text(encoding="utf-8")
    righe, sezioni = _sezioni_h2(testo)
    domande = _domande(righe, sezioni)

    sez = next(((i, f) for t, i, f in sezioni if t.lower().startswith("indicazioni strategiche")), None)
    corpo = righe[sez[0] + 1:sez[1]] if sez else []

    # Risposte: elenco numerato sotto "### Risposte alle domande chiave".
    risposte_righe, in_risposte = [], False
    for r in corpo:
        if r.startswith("###"):
            in_risposte = "rispost" in r.lower()
            continue
        if in_risposte:
            risposte_righe.append(r)
    risposte_grezze = _elenco(risposte_righe)
    risposte, etichette_risposte = [], []
    for k in range(max(len(domande), len(risposte_grezze))):
        grezza = risposte_grezze[k] if k < len(risposte_grezze) else ""
        m = re.match(r"^(Domanda\s+\d+[^:]*):\s*(.*)$", grezza, re.IGNORECASE)
        etichette_risposte.append(m.group(1).strip() if m else "")
        risposte.append(_vuoto(m.group(2) if m else grezza))

    blocchi = _blocchi_etichettati(corpo)
    tono_grezzo = " ".join(blocchi.get("tono", [])).strip()
    tono = next((t for t in TONI if _vuoto(tono_grezzo).lower().startswith(t)), "")

    criteri = []
    for voce in _elenco(blocchi.get("priorita", [])):
        m = re.match(r"^(C\d+)(.*?):\s*(.*)$", voce)
        if not m:
            continue
        valore = _vuoto(m.group(3))
        livello = ""
        ml = re.match(r"^\*{0,2}(ALTA|MEDIA|BASSA)\*{0,2}\s*(?:[—–-]\s*)?(.*)$", valore, re.IGNORECASE)
        if ml:
            livello, valore = ml.group(1).upper(), _vuoto(ml.group(2))
        criteri.append({"id": m.group(1), "etichetta": (m.group(1) + m.group(2)).strip(),
                        "livello": livello, "indicazione": valore})
    da_file = _criteri_da_file(gara_dir)
    if not criteri:
        criteri = [{**c, "livello": "", "indicazione": ""} for c in da_file]
    else:  # "C1" nudo nel template → "C1 — titolo" dalle pagine criterio
        titoli = {c["id"]: c["etichetta"] for c in da_file}
        for c in criteri:
            if c["etichetta"] == c["id"]:
                c["etichetta"] = titoli.get(c["id"], c["id"])

    def lista(chiave):
        voci = [_vuoto(v) for v in _elenco(blocchi.get(chiave, []))]
        voci = [v for v in voci if v and v.lower() not in ("nessuno", "nessuna")]
        if not voci:  # testo libero sulla stessa riga dell'etichetta
            libero = _vuoto(" ".join(x.strip() for x in blocchi.get(chiave, []) if x.strip() and not RE_VOCE.match(x)))
            voci = [libero] if libero and libero.lower() not in ("nessuno", "nessuna") else []
        return voci

    # Le note sono testo libero: le righe restano righe.
    note_righe = [x for x in blocchi.get("note", []) if x.strip() and not x.lstrip().startswith(">")]
    note = _vuoto("\n".join(RE_VOCE.sub(r"\1", x).strip() for x in note_righe))
    if note.lower() in ("nessuna", "nessuno"):
        note = ""

    valori = {
        "risposte": risposte,
        "tono": tono,
        "priorita": [{"id": c["id"], "livello": c["livello"], "indicazione": c["indicazione"]} for c in criteri],
        "vincoli": lista("vincoli"),
        "opportunita": lista("opportunita"),
        "note": note,
    }
    mancanti = _mancanti(valori, len(domande))
    return {
        "disponibile": True,
        "sezione_presente": sez is not None,
        "domande": domande,
        "etichette_risposte": etichette_risposte,
        "criteri": [{"id": c["id"], "etichetta": c["etichetta"]} for c in criteri],
        "valori": valori,
        "compilata": not mancanti,
        "mancanti": mancanti,
    }


def _mancanti(valori: dict, n_domande: int) -> list[str]:
    m = []
    if not valori.get("tono"):
        m.append("tono generale")
    for k in range(n_domande):
        if not (valori["risposte"][k] if k < len(valori["risposte"]) else ""):
            m.append(f"risposta alla domanda {k + 1}")
    for p in valori.get("priorita", []):
        if not p.get("livello") and not p.get("indicazione"):
            m.append(f"priorità di {p['id']}")
    return m


def _testo_sezione(stato: dict, valori: dict) -> str:
    oggi = datetime.now().strftime("%d/%m/%Y")
    righe = [
        TITOLO_SEZIONE, "",
        f"> Compilata dal professionista dall'interfaccia SPADA (ultimo salvataggio {oggi}).",
        "> Le indicazioni guidano l'analisi dei criteri nelle fasi successive.",
        "", "### Risposte alle domande chiave", "",
    ]
    for k in range(max(len(stato["domande"]), len(valori["risposte"]))):
        risposta = " ".join((valori["risposte"][k] if k < len(valori["risposte"]) else "").split()) or "[risposta]"
        etichetta = stato["etichette_risposte"][k] if k < len(stato["etichette_risposte"]) else ""
        righe.append(f"{k + 1}. {etichetta + ': ' if etichetta else ''}{risposta}")
    righe += ["", "### Direttive operative", "",
              f"**Tono generale:** {valori['tono'] or '[conservativo / bilanciato / audace]'}", "",
              "**Priorita' per criterio:**"]
    etichette = {c["id"]: c["etichetta"] for c in stato["criteri"]}
    for p in valori["priorita"]:
        testo = " ".join((p.get("indicazione") or "").split())
        livello = p.get("livello") or ""
        valore = (f"**{livello}**" + (f" — {testo}" if testo else "")) if livello else (testo or "[indicazione]")
        righe.append(f"- {etichette.get(p['id'], p['id'])}: {valore}")

    def blocco(titolo, voci, vuoto):
        out = ["", f"**{titolo}:**"]
        voci = [" ".join(v.split()) for v in voci if v.strip()]
        out += [f"- {v}" for v in voci] if voci else [f"- {vuoto}"]
        return out

    righe += blocco("Vincoli specifici", valori["vincoli"], "Nessuno")
    righe += blocco("Opportunita' da valorizzare", valori["opportunita"], "Nessuna")
    righe += ["", "**Note aggiuntive:**", valori["note"].strip() or "Nessuna", ""]
    return "\n".join(righe)


def _normalizza(stato: dict, dati: dict) -> dict:
    tono = (dati.get("tono") or "").strip().lower()
    if tono and tono not in TONI:
        raise IndicazioniNonValide(f"Tono non valido: {tono!r} (ammessi: {', '.join(TONI)}).")
    risposte = [str(r or "") for r in (dati.get("risposte") or [])]
    n = len(stato["domande"])
    risposte = (risposte + [""] * n)[:max(n, len(risposte))]
    ids = [c["id"] for c in stato["criteri"]]
    per_id = {p.get("id"): p for p in (dati.get("priorita") or []) if isinstance(p, dict)}
    priorita = []
    for cid in ids:
        p = per_id.get(cid, {})
        livello = (p.get("livello") or "").strip().upper()
        if livello and livello not in LIVELLI:
            raise IndicazioniNonValide(f"Livello di priorità non valido per {cid}: {livello!r}.")
        priorita.append({"id": cid, "livello": livello, "indicazione": str(p.get("indicazione") or "")})
    pulisci = lambda xs: [str(x).strip() for x in (xs or []) if str(x).strip()]
    return {"risposte": risposte, "tono": tono, "priorita": priorita,
            "vincoli": pulisci(dati.get("vincoli")), "opportunita": pulisci(dati.get("opportunita")),
            "note": str(dati.get("note") or "")}


def scrivi(gara_dir: Path, dati: dict) -> dict:
    """Riscrive la sola sezione delle indicazioni (o la aggiunge in coda se
    manca) e ritorna lo stato aggiornato."""
    stato = leggi(gara_dir)
    if not stato.get("disponibile"):
        raise IndicazioniNonValide("strategy_audit.md non esiste ancora: esegui prima la Fase 3.")
    valori = _normalizza(stato, dati)
    p = _percorso(gara_dir)
    righe, sezioni = _sezioni_h2(p.read_text(encoding="utf-8"))
    sez = next(((i, f) for t, i, f in sezioni if t.lower().startswith("indicazioni strategiche")), None)
    nuova = _testo_sezione(stato, valori).split("\n")
    if sez:
        righe = righe[:sez[0]] + nuova + righe[sez[1]:]
    else:
        righe = righe + ["", "---", ""] + nuova
    scrivi_atomico(p, "\n".join(righe))
    return leggi(gara_dir)


def registra_per_le_fasi_successive(gara_dir: Path, stato: dict):
    """All'approvazione: le indicazioni in _state/memoria.md e nell'handoff
    della Fase 3, che le fasi successive ricevono nel prompt (spada_fase.sh).
    Idempotente: una nuova approvazione sostituisce la precedente."""
    v = stato["valori"]
    priorita = [f"{p['id']}: {p['livello'] or '—'}{' — ' + p['indicazione'] if p['indicazione'] else ''}" for p in v["priorita"]]
    oggi = datetime.now(timezone.utc).isoformat()

    linee = [f"Tono generale: {v['tono']}"]
    linee += [f"Priorità {x}" for x in priorita]
    linee += [f"Vincolo: {x}" for x in v["vincoli"]]
    linee += [f"Opportunità: {x}" for x in v["opportunita"]]
    if v["note"].strip():
        linee.append(f"Note: {' '.join(v['note'].split())}")
    linee += [f"Risposta alla domanda {k + 1}: {' '.join(r.split())}" for k, r in enumerate(v["risposte"]) if r.strip()]

    # Handoff della Fase 3 (decisioni = "prese dal professionista, rilevanti a valle").
    h_path = gara_dir / "_state" / "handoff" / "3_analisi_strategica.json"
    try:
        handoff = json.loads(h_path.read_text(encoding="utf-8"))
    except Exception:
        handoff = {"fase": 3, "generato_il": oggi, "entita_chiave": [], "riferimenti": []}
    handoff["decisioni"] = [d for d in handoff.get("decisioni", []) if not str(d).startswith(PREFISSO_HANDOFF)]
    handoff["decisioni"] += [f"{PREFISSO_HANDOFF} {x}" for x in linee]
    rif = {"percorso_o_nodo": "output/03_criteria/strategy_audit.md",
           "descrizione": "sezione «Indicazioni strategiche del professionista», compilata e approvata"}
    if not any(r.get("descrizione") == rif["descrizione"] for r in handoff.get("riferimenti", [])):
        handoff.setdefault("riferimenti", []).append(rif)
    h_path.parent.mkdir(parents=True, exist_ok=True)
    h_path.write_text(json.dumps(handoff, ensure_ascii=False, indent=2), encoding="utf-8")

    # Memoria di gara: un solo paragrafo, rimpiazzato a ogni approvazione.
    m_path = gara_dir / "_state" / "memoria.md"
    memoria = m_path.read_text(encoding="utf-8") if m_path.exists() else ""
    memoria = re.sub(r"\n## Indicazioni strategiche del professionista \(Fase 3\).*?(?=\n## |\Z)", "", memoria, flags=re.DOTALL)
    paragrafo = [f"\n## Indicazioni strategiche del professionista (Fase 3)\n",
                 f"Approvate il {datetime.now().strftime('%d/%m/%Y')}. Fonte: `output/03_criteria/strategy_audit.md`.\n"]
    paragrafo += [f"- {x}" for x in linee]
    m_path.write_text(memoria.rstrip("\n") + "\n" + "\n".join(paragrafo) + "\n", encoding="utf-8")
