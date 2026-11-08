#!/usr/bin/env python3
"""aggiorna_manodopera.py — tabella ANCE del costo orario della manodopera.

Legge `references/manodopera_ance.md` (sezioni «## <Provincia> — tabella
ANCE n. <n>, in vigore dal <gg/mm/aaaa>») e dice quale edizione vale
alla data del bando. Se la data del bando è successiva all'ultima
edizione nota, prova a cercarne una più recente sul sito dell'ANCE
territoriale (per Napoli: ACEN, categoria «Tabelle costo manodopera»),
scarica il PDF, estrae le righe «TOTALE RETRIBUZIONE ED ONERI» e
**propone** una nuova sezione marcata «DA CONFERMARE» — i numeri non
diventano definitivi finché il professionista non li vede.

  applicabile --data-bando 2026-11-20 [--provincia Napoli] [--offline] [--json]
      stampa l'edizione da usare (la più recente con decorrenza <= data bando);
      se la data del bando è oltre l'ultima edizione nota e non è --offline,
      controlla online e, se trova un'edizione nuova, la aggiunge al file come
      «DA CONFERMARE» e la restituisce
  online      [--provincia Napoli] [--dry-run]
      forza il controllo online e l'eventuale aggiunta
  pdf <file.pdf> [--provincia Napoli] [--dry-run]
      estrae i valori da un PDF ANCE già scaricato (test, o quando la rete manca)

Dipendenze: libreria standard; `pdfplumber` o `pypdf` per leggere il PDF.
Qualunque errore di rete o di lettura è non bloccante: lo script lo dice
e la skill usa l'ultima edizione nota con la nota «da aggiornare».
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TABELLE_INIZIALI = SKILL_DIR / "references" / "manodopera_ance.md"
# Dentro SPADA la tabella aggiornata sta nei dati (SPADA_HOME/_data), non
# nella skill: la skill è nella copia di lavoro della repo e un file
# tracciato riscritto qui la lascerebbe modificata. La copia nella skill
# resta il punto di partenza, copiata al primo aggiornamento.
_DATI = Path(os.environ["SPADA_HOME"]) / "_data" / "analisi-nuovi-prezzi" if os.environ.get("SPADA_HOME") else None
FILE_TABELLE = _DATI / "manodopera_ance.md" if _DATI and (_DATI / "manodopera_ance.md").is_file() else TABELLE_INIZIALI
FILE_TABELLE_AGGIORNATO = _DATI / "manodopera_ance.md" if _DATI else TABELLE_INIZIALI
LIVELLI = ["1° livello — operaio comune", "2° livello — operaio qualificato",
           "3° livello — operaio specializzato", "4° livello — operaio 4° liv."]
FONTI_ONLINE = {  # provincia -> pagina indice delle tabelle, filtro sul titolo del post
    "napoli": ("https://acen.it/category/tabelle-manodopera/", r"napoli|nuove tabelle del costo della manodopera"),
    "avellino": ("https://acen.it/category/tabelle-manodopera/", r"avellino"),
    "benevento": ("https://acen.it/category/tabelle-manodopera/", r"benevento"),
    "caserta": ("https://acen.it/category/tabelle-manodopera/", r"caserta"),
    "salerno": ("https://acen.it/category/tabelle-manodopera/", r"salerno"),
}
RE_SEZIONE = re.compile(r"^## (?P<prov>[A-Za-zÀ-ú' ]+) — tabella ANCE n\. (?P<n>\d+), in vigore dal (?P<data>\d{2}/\d{2}/\d{4})(?P<flag>.*)$", re.M)
RE_RIGA = re.compile(r"^\| (?P<liv>[1-4])° livello[^|]*\| (?P<fino>[\d,]+) \| (?P<oltre>[\d,]+) \|$", re.M)
UA = {"User-Agent": "SPADA-analisi-nuovi-prezzi/1.0 (aggiornamento tabella manodopera)"}


def _data(s: str) -> dt.date:
    g, m, a = s.split("/")
    return dt.date(int(a), int(m), int(g))


def _num(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


def _it(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


# ── lettura del file ────────────────────────────────────────────────────

def edizioni(testo: str) -> list[dict]:
    out = []
    pezzi = list(RE_SEZIONE.finditer(testo))
    for i, m in enumerate(pezzi):
        fine = pezzi[i + 1].start() if i + 1 < len(pezzi) else len(testo)
        corpo = testo[m.end():fine]
        # ferma al prossimo titolo di secondo livello che non è una edizione
        corpo = corpo.split("\n## ", 1)[0]
        valori = {int(r["liv"]): (_num(r["fino"]), _num(r["oltre"])) for r in RE_RIGA.finditer(corpo)}
        out.append({"provincia": m["prov"].strip(), "tabella": int(m["n"]), "decorrenza": _data(m["data"]),
                    "da_confermare": "CONFERMARE" in m["flag"].upper(), "valori": valori})
    return out


def applicabile(ediz: list[dict], provincia: str, data_bando: dt.date) -> tuple[dict | None, bool]:
    """(edizione da usare, True se la data del bando è oltre l'ultima edizione nota)."""
    mie = sorted((e for e in ediz if e["provincia"].lower() == provincia.lower()), key=lambda e: e["decorrenza"])
    if not mie:
        return None, True
    valide = [e for e in mie if e["decorrenza"] <= data_bando]
    return (valide[-1] if valide else mie[0]), data_bando > mie[-1]["decorrenza"]


# ── PDF ─────────────────────────────────────────────────────────────────

def testo_pdf(path: Path) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(str(path)) as pdf:
            return "\n".join((p.extract_text() or "") for p in pdf.pages)
    except ImportError:
        from pypdf import PdfReader
        return "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)


def estrai(testo: str) -> dict:
    """Numero tabella, decorrenza, due righe TOTALE RETRIBUZIONE ED ONERI (fino / oltre 15)."""
    piatto = re.sub(r"\s+", " ", testo)
    n = re.search(r"Tabella\s+N[Rr]?\.?\s*(\d+)", piatto)
    d = re.search(r"in vigore dal\s*(\d{1,2}/\d{1,2}/\d{4})", piatto)
    tot = re.findall(r"TOTALE RETRIBUZIONE ED ONERI\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", piatto)
    if not tot:
        raise ValueError("nessuna riga «TOTALE RETRIBUZIONE ED ONERI» con quattro importi: il layout del PDF è cambiato")
    fino = [_num(x) for x in tot[0]]
    oltre = [_num(x) for x in tot[1]] if len(tot) > 1 else fino
    # ordine atteso: comune < qualificato < specializzato < 4° livello
    if not (fino[0] < fino[1] < fino[2] < fino[3]):
        raise ValueError(f"importi non crescenti per livello ({fino}): colonne lette in ordine sbagliato")
    if not d:
        raise ValueError("decorrenza («in vigore dal gg/mm/aaaa») non trovata")
    gg, mm, aa = d.group(1).split("/")
    return {"tabella": int(n.group(1)) if n else None, "decorrenza": dt.date(int(aa), int(mm), int(gg)),
            "fino_15": fino, "oltre_15": oltre, "una_sola_versione": len(tot) < 2}


# ── online ──────────────────────────────────────────────────────────────

def _get(url: str, binario: bool = False, timeout: int = 30):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        dati = r.read()
    return dati if binario else dati.decode("utf-8", "replace")


def cerca_pdf_online(provincia: str) -> tuple[str, str]:
    """Restituisce (url del post più recente, url del PDF) per la provincia."""
    chiave = provincia.lower()
    if chiave not in FONTI_ONLINE:
        raise ValueError(f"nessuna fonte online configurata per «{provincia}» (aggiungila in FONTI_ONLINE)")
    indice, filtro = FONTI_ONLINE[chiave]
    html = _get(indice)
    # link dei post, nell'ordine della pagina (il più recente per primo)
    post = []
    for m in re.finditer(r'<a[^>]+href="(https://acen\.it/\d{4}/\d{2}/\d{2}/[^"]+)"[^>]*>(.*?)</a>', html, re.S):
        url, titolo = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if url not in [p[0] for p in post]:
            post.append((url, titolo))
    for url, titolo in post:
        pagina = _get(url)
        testo = re.sub(r"<[^>]+>", " ", pagina)
        if not re.search(filtro, titolo + " " + testo[:3000], re.I):
            continue
        if chiave != "napoli" and not re.search(chiave, titolo + " " + testo[:3000], re.I):
            continue
        if chiave == "napoli" and re.search(r"avellino|benevento|caserta|salerno", titolo, re.I) and not re.search("napoli", titolo, re.I):
            continue
        pdf = re.search(r'href="(https://acen\.it/wp-content/uploads/[^"]+\.pdf)"', pagina)
        if pdf:
            return url, pdf.group(1)
    raise ValueError("nessun post con PDF trovato nella pagina indice")


# ── scrittura della sezione ─────────────────────────────────────────────

def sezione_md(provincia: str, e: dict, fonte_url: str, post_url: str | None, confermare: bool = True) -> str:
    oggi = dt.date.today().isoformat()
    flag = " — DA CONFERMARE" if confermare else ""
    righe = [f"## {provincia} — tabella ANCE n. {e['tabella'] or '?'}, in vigore dal {e['decorrenza']:%d/%m/%Y}{flag}", ""]
    if confermare:
        righe += [f"Sezione aggiunta automaticamente da `aggiorna_manodopera.py` il {oggi}: valori",
                  "estratti dal PDF ANCE, **da confermare dal professionista** (poi togliere",
                  "«DA CONFERMARE» dal titolo e questa nota).", ""]
    righe += [f"Fonte: PDF <{fonte_url}>" + (f" (post: <{post_url}>)" if post_url else ""), ""]
    righe += ["| Livello | Fino a 15 dip. (€/h) | Oltre 15 dip. (€/h) |", "|---|---|---|"]
    for i, nome in enumerate(LIVELLI):
        righe.append(f"| {nome} | {_it(e['fino_15'][i])} | {_it(e['oltre_15'][i])} |")
    if e.get("una_sola_versione"):
        righe += ["", "(Il PDF riporta una sola versione: le due colonne coincidono.)"]
    righe += ["", f"Fonte da scrivere: `tabella ANCE {provincia} n. {e['tabella'] or '?'} (dal {e['decorrenza']:%d/%m/%Y}), oltre 15 dip.`", ""]
    return "\n".join(righe)


def aggiungi_sezione(testo_file: str, sezione: str) -> str:
    """Inserisce la sezione prima di «## Edizioni precedenti» o «## Altre province», altrimenti in coda."""
    for marcatore in ("\n## Edizioni precedenti", "\n## Altre province"):
        i = testo_file.find(marcatore)
        if i >= 0:
            return testo_file[:i].rstrip() + "\n\n" + sezione + testo_file[i:]
    return testo_file.rstrip() + "\n\n" + sezione


def proponi(provincia: str, estratto: dict, pdf_url: str, post_url: str | None, dry_run: bool) -> dict:
    global FILE_TABELLE
    testo = FILE_TABELLE.read_text(encoding="utf-8")
    note = [e for e in edizioni(testo) if e["provincia"].lower() == provincia.lower()]
    if any(e["tabella"] == estratto["tabella"] or e["decorrenza"] == estratto["decorrenza"] for e in note):
        return {"esito": "gia_presente", "tabella": estratto["tabella"], "decorrenza": estratto["decorrenza"].isoformat()}
    sez = sezione_md(provincia.title(), estratto, pdf_url, post_url)
    if not dry_run:
        FILE_TABELLE_AGGIORNATO.parent.mkdir(parents=True, exist_ok=True)
        FILE_TABELLE_AGGIORNATO.write_text(aggiungi_sezione(testo, sez), encoding="utf-8")
        FILE_TABELLE = FILE_TABELLE_AGGIORNATO  # le letture successive vedono la tabella aggiornata
    return {"esito": "aggiunta" if not dry_run else "proposta", "tabella": estratto["tabella"],
            "decorrenza": estratto["decorrenza"].isoformat(), "sezione": sez}


def controlla_online(provincia: str, dry_run: bool) -> dict:
    try:
        post_url, pdf_url = cerca_pdf_online(provincia)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(_get(pdf_url, binario=True))
            tmp = Path(f.name)
        estratto = estrai(testo_pdf(tmp))
        tmp.unlink(missing_ok=True)
        r = proponi(provincia, estratto, pdf_url, post_url, dry_run)
        r["pdf"] = pdf_url
        return r
    except Exception as ex:  # rete, layout, parsing: mai bloccante
        return {"esito": "errore", "errore": f"{type(ex).__name__}: {ex}",
                "indice": FONTI_ONLINE.get(provincia.lower(), ("?",))[0]}


# ── CLI ─────────────────────────────────────────────────────────────────

def _stampa_edizione(e: dict, nota: str | None = None):
    print(f"Tabella ANCE {e['provincia']} n. {e['tabella']}, in vigore dal {e['decorrenza']:%d/%m/%Y}"
          + (" — DA CONFERMARE" if e["da_confermare"] else ""))
    for liv in sorted(e["valori"]):
        fino, oltre = e["valori"][liv]
        print(f"  {LIVELLI[liv - 1]}: fino a 15 dip. {_it(fino)} · oltre 15 dip. {_it(oltre)} €/h")
    print(f"  Fonte da scrivere: tabella ANCE {e['provincia']} n. {e['tabella']} (dal {e['decorrenza']:%d/%m/%Y}), oltre 15 dip.")
    if nota:
        print(f"  Nota: {nota}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("applicabile"); s.add_argument("--data-bando", required=True); s.add_argument("--provincia", default="Napoli")
    s.add_argument("--offline", action="store_true"); s.add_argument("--json", action="store_true")
    s = sub.add_parser("online"); s.add_argument("--provincia", default="Napoli"); s.add_argument("--dry-run", action="store_true")
    s = sub.add_parser("pdf"); s.add_argument("file"); s.add_argument("--provincia", default="Napoli"); s.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    if a.cmd == "pdf":
        estratto = estrai(testo_pdf(Path(a.file)))
        r = proponi(a.provincia, estratto, f"file://{Path(a.file).resolve()}", None, a.dry_run)
        print(json.dumps({k: v for k, v in r.items() if k != "sezione"}, ensure_ascii=False, indent=2))
        if "sezione" in r:
            print("\n" + r["sezione"])
        return 0
    if a.cmd == "online":
        r = controlla_online(a.provincia, a.dry_run)
        print(json.dumps({k: v for k, v in r.items() if k != "sezione"}, ensure_ascii=False, indent=2))
        if "sezione" in r:
            print("\n" + r["sezione"])
        return 0 if r["esito"] != "errore" else 1

    data_bando = dt.date.fromisoformat(a.data_bando)
    testo = FILE_TABELLE.read_text(encoding="utf-8")
    ed, stantia = applicabile(edizioni(testo), a.provincia, data_bando)
    nota = None
    if stantia and not a.offline:
        r = controlla_online(a.provincia, dry_run=False)
        if r["esito"] == "aggiunta":
            ed, stantia = applicabile(edizioni(FILE_TABELLE.read_text(encoding="utf-8")), a.provincia, data_bando)
            nota = f"edizione n. {r['tabella']} scaricata ora dal sito ANCE e aggiunta al file come DA CONFERMARE"
        elif r["esito"] == "gia_presente":
            nota = "sul sito ANCE non c'è un'edizione più recente di quella nota: la tabella è aggiornata"
            stantia = False
        else:
            nota = (f"controllo online fallito ({r.get('errore')}); usare l'ultima edizione nota e scrivere "
                    f"«da aggiornare all'edizione in vigore alla data del bando» — verificare a mano su {r.get('indice')}")
    elif stantia:
        nota = "data del bando oltre l'ultima edizione nota (controllo online non eseguito): scrivere «da aggiornare»"
    if ed is None:
        print(f"Nessuna tabella per «{a.provincia}» in {FILE_TABELLE.name}: aggiungerla (vedi FONTI_ONLINE / siti ANCE territoriali).")
        return 1
    if a.json:
        print(json.dumps({"provincia": ed["provincia"], "tabella": ed["tabella"], "decorrenza": ed["decorrenza"].isoformat(),
                          "da_confermare": ed["da_confermare"], "stantia": stantia, "nota": nota,
                          "valori": {str(k): {"fino_15": v[0], "oltre_15": v[1]} for k, v in ed["valori"].items()}},
                         ensure_ascii=False, indent=2))
    else:
        _stampa_edizione(ed, nota)
    return 0


if __name__ == "__main__":
    sys.exit(main())
