#!/usr/bin/env python3
"""Deliverable dell'offerta: un documento per ciascuno, non uno per criterio.

disciplinare-analyst scrive in manifest.json → deliverables, per ogni
criterio, i documenti che quel criterio richiede: la stessa relazione
tecnica compare così sotto C1, C2, … C6. Qui le voci che descrivono lo
stesso documento (stessa `fonte` nel disciplinare, es. «art. 16 lett. a»)
diventano un deliverable solo, che copre tutti i criteri elencati.

Ogni tipo con un procedimento definito (skill dedicata) si produce per
stadi, ciascuno approvato dal professionista prima del successivo:

  relazione_tecnica: scaletta → bozza → definitivo
  computo_metrico:   voci → bozza → definitivo

Gli altri tipi hanno un solo stadio («documento»), come prima.
Lo stato sta in _state/deliverables.json[id]; i file in
output/10_offer/<id>/. Usato dal backend (deliverables.py) e da
spada_deliverable.sh, così le due parti non divergono.

Uso da riga di comando (cwd = cartella della gara):
  deliverables_offerta.py risolvi <id> [<argomento_json>]
      Stampa il JSON del deliverable con lo stadio da eseguire.
  deliverables_offerta.py concludi <id> <stadio> <esito> <run_id> <avviato_il>
      Registra l'esito dello stadio e ricalcola lo stato della Fase 7.
"""
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

AGENTE_PER_TIPO = {
    "relazione_tecnica": "offer-writer",
    "computo_metrico": "deliverable-computo-metrico",
    "legge_10": "deliverable-legge-10",
    "cronoprogramma": "deliverable-cronoprogramma",
    "tavole_tecniche": "deliverable-tavole-tecniche",
    "altro": "deliverable-generico",
}
SKILL_PER_TIPO = {
    "relazione_tecnica": "deliverable-relazione-tecnica",
    "computo_metrico": "deliverable-computo-metrico",
}
# (id, etichetta, file nella cartella del deliverable)
STADI = {
    "relazione_tecnica": [("scaletta", "Scaletta", "1_scaletta.md"),
                          ("bozza", "Bozza", "2_bozza.md"),
                          ("definitivo", "Definitivo", "3_definitivo.md")],
    "computo_metrico": [("voci", "Elenco delle voci", "1_voci.md"),
                        ("bozza", "Bozza del computo", "2_bozza.md"),
                        ("definitivo", "Definitivo", "3_definitivo.md")],
}
STADIO_UNICO = [("documento", "Documento", None)]


def _ora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _leggi(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _scrivi(p: Path, dati):
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


# ── Raggruppamento ──────────────────────────────────────────────────
def nome_documento(nome: str, tipo: str) -> str:
    """«Relazione tecnica — sezione C1» → «Relazione tecnica»."""
    if tipo == "relazione_tecnica":
        return "Relazione tecnica"
    n = re.sub(r"\s*[—–-]\s*(sezione|voci|righe|parte)\s+C\d+\b.*$", "", nome, flags=re.I)
    n = re.sub(r"\s*[—–-]\s*documento unico.*$", "", n, flags=re.I)
    n = re.sub(r"\s+C\d+(\s*[-–]\s*C\d+)?(?=[\s),.;]|$)", "", n)
    return re.sub(r"\s{2,}", " ", n).strip(" —–-") or nome


def _slug(testo: str) -> str:
    t = unicodedata.normalize("NFKD", testo).encode("ascii", "ignore").decode().lower()
    parole = re.sub(r"[^a-z0-9]+", " ", t).split()
    out = ""
    for p in parole:
        if len(out) + len(p) + 1 > 48:
            break
        out = f"{out}-{p}" if out else p
    return out or "deliverable"


def _chiave(voce: dict) -> str:
    fonte = re.sub(r"\s+", " ", (voce.get("fonte") or "").lower())
    fonte = re.sub(r",?\s*p(p)?\.\s*[\d\-–, ]+$", "", fonte).strip()  # la pagina non distingue il documento
    return fonte or f"{voce.get('tipo', 'altro')}|{nome_documento(voce.get('nome', ''), voce.get('tipo', '')).lower()}"


def raggruppa(manifest: dict) -> list[dict]:
    gruppi: dict[str, dict] = {}
    for criterio, voci in (manifest.get("deliverables") or {}).items():
        for i, voce in enumerate(voci or []):
            k = _chiave(voce)
            g = gruppi.get(k)
            if g is None:
                tipo = voce.get("tipo") or "altro"
                g = gruppi[k] = {
                    "nome": nome_documento(voce.get("nome", ""), tipo), "tipo": tipo,
                    "fonte": voce.get("fonte", ""), "vincolo_formato": voce.get("vincolo_formato", ""),
                    "criteri": [], "voci_manifest": [],
                }
            if criterio not in g["criteri"]:
                g["criteri"].append(criterio)
            g["voci_manifest"].append({"id": f"{criterio}-{i}", **voce})
    usati: set[str] = set()
    out = []
    for g in gruppi.values():
        base = _slug(g["nome"])
        did, n = base, 2
        while did in usati:
            did, n = f"{base}-{n}", n + 1
        usati.add(did)
        testo = " ".join(f"{v.get('nome', '')} {v.get('vincolo_formato', '')}" for v in g["voci_manifest"]).lower()
        g["trasversale"] = len(g["criteri"]) > 1 or "documento unico" in testo or "intera offerta" in testo
        out.append({"id": did, **g, "agente": AGENTE_PER_TIPO.get(g["tipo"], "deliverable-generico"),
                    "skill": SKILL_PER_TIPO.get(g["tipo"]), "cartella": f"output/10_offer/{did}"})
    return out


def trova(manifest: dict, did: str) -> dict | None:
    return next((d for d in raggruppa(manifest) if d["id"] == did), None)


# ── Stadi e stato ───────────────────────────────────────────────────
def stadi_di(tipo: str) -> list:
    return STADI.get(tipo, STADIO_UNICO)


def _stato_file(gara: Path) -> Path:
    return gara / "_state" / "deliverables.json"


def stato_deliverable(gara: Path, dl: dict) -> dict:
    """Stato completo: stato complessivo e, per ogni stadio, stato e file.
    Stati di stadio: da_produrre, da_approvare, approvato, superato
    (prodotto, ma uno stadio precedente è cambiato dopo)."""
    tutto = _leggi(_stato_file(gara), {})
    s = tutto.get(dl["id"], {})
    reg = s.get("stadi", {})
    stadi = []
    for sid, etichetta, nome_file in stadi_di(dl["tipo"]):
        r = reg.get(sid, {})
        stadi.append({"id": sid, "etichetta": etichetta,
                      "file": f"{dl['cartella']}/{nome_file}".removeprefix("output/") if nome_file else None,
                      "stato": r.get("stato", "da_produrre"), "prodotto_il": r.get("prodotto_il"),
                      "approvato_il": r.get("approvato_il"), "nota": r.get("nota")})
    # Stato scritto dallo script: in_esecuzione, pronto, interrotta, errore;
    # da_rivedere lo scrive la conferma della Fase 6 (scritto prima delle decisioni).
    scritto = s.get("stato")
    if scritto in ("in_esecuzione", "interrotta", "errore", "da_rivedere"):
        complessivo = scritto
    elif any(x["stato"] == "da_approvare" for x in stadi):
        complessivo = "da_approvare"
    elif all(x["stato"] == "approvato" for x in stadi):
        complessivo = "completata"
    else:
        complessivo = "da_eseguire"
    return {"stato": complessivo, "stadi": stadi, "nota": s.get("nota"), "errore": s.get("errore")}


def stadio_successivo(gara: Path, dl: dict) -> str | None:
    """Primo stadio da produrre: None se uno aspetta l'approvazione o se
    sono tutti fatti."""
    st = stato_deliverable(gara, dl)
    for x in st["stadi"]:
        if x["stato"] == "da_approvare":
            return None
        if x["stato"] in ("da_produrre", "superato"):
            return x["id"]
    return None


def _aggiorna(gara: Path, did: str, fn):
    p = _stato_file(gara)
    tutto = _leggi(p, {})
    voce = tutto.setdefault(did, {})
    fn(voce)
    _scrivi(p, tutto)


def segna_avvio(gara: Path, dl: dict, stadio: str, run_id: str):
    def fn(v):
        v.update(stato="in_esecuzione", stadio_in_corso=stadio, run_id=run_id, errore=None,
                 agente=dl["agente"], output_dir=dl["cartella"])
        v.setdefault("iniziata_il", _ora())
    _aggiorna(gara, dl["id"], fn)


def concludi(gara: Path, dl: dict, stadio: str, esito: str, errore: str | None = None):
    """Esito dello stadio: completato → da approvare (l'ultimo stadio di
    un procedimento, o lo stadio unico, conta come approvato: il documento
    è prodotto). Uno stadio rifatto rende superati quelli dopo."""
    ordine = [s[0] for s in stadi_di(dl["tipo"])]

    def fn(v):
        v.pop("stadio_in_corso", None)
        v["conclusa_il"] = _ora()
        if esito != "completato":
            v["stato"] = "interrotta" if esito == "interrotto" else "errore"
            v["errore"] = errore
            return
        v["stato"], v["errore"] = "pronto", None
        v.pop("nota", None)
        stadi = v.setdefault("stadi", {})
        ultimo = stadio == ordine[-1]
        stadi[stadio] = {"stato": "approvato" if ultimo else "da_approvare", "prodotto_il": _ora(),
                         **({"approvato_il": _ora()} if ultimo else {})}
        for dopo in ordine[ordine.index(stadio) + 1:]:
            if stadi.get(dopo, {}).get("stato") in ("approvato", "da_approvare"):
                stadi[dopo]["stato"] = "superato"
    _aggiorna(gara, dl["id"], fn)
    ricalcola_fase7(gara)


def approva(gara: Path, dl: dict, stadio: str) -> str | None:
    """Approva lo stadio; restituisce lo stadio successivo da produrre."""
    ordine = [s[0] for s in stadi_di(dl["tipo"])]

    def fn(v):
        r = v.setdefault("stadi", {}).setdefault(stadio, {})
        r.update(stato="approvato", approvato_il=_ora())
    _aggiorna(gara, dl["id"], fn)
    ricalcola_fase7(gara)
    i = ordine.index(stadio)
    return ordine[i + 1] if i + 1 < len(ordine) else None


def salva_testo(gara: Path, dl: dict, stadio: str, testo: str):
    """Modifica a mano del professionista: il file cambia, lo stadio torna
    da approvare (salvo l'ultimo, che resta prodotto) e quelli dopo sono superati."""
    voce = next(s for s in stadi_di(dl["tipo"]) if s[0] == stadio)
    f = gara / dl["cartella"] / voce[2]
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(testo.rstrip() + "\n", encoding="utf-8")
    concludi(gara, dl, stadio, "completato")

    def fn(v):
        v["stadi"][stadio]["modificato_a_mano_il"] = _ora()
    _aggiorna(gara, dl["id"], fn)


def ricalcola_fase7(gara: Path):
    manifest = _leggi(gara / "manifest.json", {})
    elenco = raggruppa(manifest)
    if not elenco:
        return
    stati = [stato_deliverable(gara, d)["stato"] for d in elenco]
    fatti = sum(1 for s in stati if s == "completata")
    p = gara / "_state" / "fasi.json"
    fasi = _leggi(p, None)
    if not fasi or "7_stesura_offerta" not in fasi.get("fasi", {}):
        return
    f7 = fasi["fasi"]["7_stesura_offerta"]
    if fatti == len(elenco):
        f7.update(stato="completata", sintesi=f"Tutti i {len(elenco)} deliverable prodotti.", conclusa_il=_ora())
    else:
        attesa = sum(1 for s in stati if s == "da_approvare")
        f7.update(stato="da_eseguire", sintesi=f"{fatti}/{len(elenco)} deliverable prodotti"
                  + (f", {attesa} in attesa della tua approvazione." if attesa else "."))
        f7.pop("conclusa_il", None)
    _scrivi(p, fasi)


# ── Nomenclatura interna: vietata nei testi per la stazione appaltante ─
# Codici del sistema (proposte, gap, evidenze, domande, rischi, tavole
# interne), wikilink e percorsi interni. Le sigle di criterio (C1, C1.1)
# non si controllano qui: «C3» può essere una classe di corrosione.
RE_INTERNI = re.compile(
    r"\b[PGERQDI]-C\d+-\d{2,3}\b"          # P-C1-001, G-C2-005, E-C2-016, R-C2-010, Q-C1-006
    r"|\b[DQRX]-\d{2,3}\b"                   # D-020, X-06
    r"|\bTAV-M-\d+\b"
    r"|\[\[[^\]\n]+\]\]"                    # [[wikilink]]
    r"|\b(?:02_graph|05_criteria_outputs|06_registers|_state)/\S*"
    r"|\bC\d+_output\.md\b")


def stadio_di_lavoro(tipo: str, stadio: str) -> bool:
    """Lo stadio 1 (scaletta, elenco delle voci) è un documento di lavoro:
    lì i codici interni sono ammessi per brevità."""
    stadi = stadi_di(tipo)
    return len(stadi) > 1 and stadio == stadi[0][0]


def riferimenti_interni(testo: str) -> list[str]:
    """Occorrenze di nomenclatura interna, senza ripetizioni, nell'ordine."""
    visti, out = set(), []
    for m in RE_INTERNI.finditer(testo):
        if m.group(0) not in visti:
            visti.add(m.group(0))
            out.append(m.group(0))
    return out


def file_da_controllare(gara: Path, dl: dict, stadio: str) -> list[Path]:
    voce = next(s for s in stadi_di(dl["tipo"]) if s[0] == stadio)
    if voce[2]:
        return [gara / dl["cartella"] / voce[2]]
    return sorted((gara / dl["cartella"]).glob("*.md"))


# ── Riga di comando (spada_deliverable.sh) ──────────────────────────
def _cli_risolvi(did: str, argomento: str) -> int:
    gara = Path.cwd()
    manifest = _leggi(gara / "manifest.json", {})
    dl = trova(manifest, did)
    if dl is None:
        print(f"Deliverable '{did}' non trovato fra i documenti dell'offerta.", file=sys.stderr)
        return 1
    arg = json.loads(argomento) if argomento else {}
    stadio = arg.get("stadio") or (stadi_di(dl["tipo"])[0][0] if arg.get("da_capo") else stadio_successivo(gara, dl))
    if stadio is None:
        st = stato_deliverable(gara, dl)
        attesa = next((x["etichetta"] for x in st["stadi"] if x["stato"] == "da_approvare"), None)
        print(f"«{attesa}» aspetta la tua approvazione: approvalo o chiedi modifiche." if attesa
              else "Il deliverable è già prodotto: per rifarlo usa «Riesegui» o chiedi modifiche al definitivo.",
              file=sys.stderr)
        return 3
    ordine = stadi_di(dl["tipo"])
    i = [s[0] for s in ordine].index(stadio)
    print(json.dumps({
        **dl, "stadio": stadio, "stadio_etichetta": ordine[i][1],
        "file_stadio": f"{dl['cartella']}/{ordine[i][2]}" if ordine[i][2] else None,
        "stadi_precedenti": [f"{dl['cartella']}/{s[2]}" for s in ordine[:i] if s[2]],
        "file_attuale_esiste": bool(ordine[i][2] and (gara / dl["cartella"] / ordine[i][2]).is_file()),
        "nota": (arg.get("nota") or "").strip() or None,
    }, ensure_ascii=False))
    return 0


def _cli_concludi(did: str, stadio: str, esito: str, errore: str) -> int:
    gara = Path.cwd()
    dl = trova(_leggi(gara / "manifest.json", {}), did)
    if dl is None:
        return 1
    concludi(gara, dl, stadio, esito, errore or None)
    return 0


def _cli_controlla(did: str, stadio: str) -> int:
    """Stampa «file: codici» per ogni file con nomenclatura interna; esce
    con 4 se ne trova (0 se lo stadio è di lavoro o il testo è pulito)."""
    gara = Path.cwd()
    dl = trova(_leggi(gara / "manifest.json", {}), did)
    if dl is None or stadio_di_lavoro(dl["tipo"], stadio):
        return 0
    trovati = 0
    for f in file_da_controllare(gara, dl, stadio):
        if f.is_file() and (r := riferimenti_interni(f.read_text(encoding="utf-8"))):
            trovati += 1
            print(f"{f.relative_to(gara)}: {', '.join(r[:40])}{' …' if len(r) > 40 else ''}")
    return 4 if trovati else 0


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "controlla":
        sys.exit(_cli_controlla(sys.argv[2], sys.argv[3]))
    if len(sys.argv) >= 3 and sys.argv[1] == "risolvi":
        sys.exit(_cli_risolvi(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ""))
    if len(sys.argv) >= 5 and sys.argv[1] == "concludi":
        sys.exit(_cli_concludi(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else ""))
    print(__doc__, file=sys.stderr)
    sys.exit(1)
