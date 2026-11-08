#!/usr/bin/env python3
"""analisi_np.py — strumenti deterministici della skill `analisi-nuovi-prezzi`.

Il JSON (`analisi_nuovi_prezzi.json`) contiene solo gli input: righe con
quantità, costo unitario e fonte, più le percentuali (sempre 3/15/10:
`verifica` rifiuta altri valori). Ogni riga ha un costo: niente TBD, le
stime si dichiarano con fonte «stima — …». Tutto il resto
(importi, totali, incidenze, prezzo di applicazione) lo calcola questo
script, così nessun totale scritto a mano può nascondere un errore.

Sottocomandi (tutti prendono la cartella del deliverable, default `.`):

  rendi     <cartella>            JSON → markdown + Excel (layout del foglio di riferimento)
  xlsx      <cartella>            solo l'Excel
  verifica  <cartella>            ricalcola dal JSON, controlla la coerenza interna e,
                                  se c'è, confronta il markdown con il ricalcolo (exit 1 se incoerente)
  apprendi  <cartella> [--archivia] [--gara S] [--memoria DIR]
                                  confronta il JSON corrente con _generato/ e stampa le
                                  differenze come lezioni candidate; con --archivia copia le
                                  analisi in memoria/analisi_approvate/ e i prezzi corretti in
                                  memoria/prezzi_appresi.json
  memoria   stato [--memoria DIR] riepilogo della memoria: lezioni per sezione, conferme,
                                  prezzi appresi (e scaduti), analisi archiviate, candidate
                                  alla promozione in references/metodo.md

Dipendenze: solo libreria standard; `openpyxl` per l'Excel (se manca,
rendi/xlsx lo dicono e saltano l'Excel senza fallire).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import shutil
import sys
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

SCHEMA = "analisi-nuovi-prezzi/1.0"
SEZIONI = [  # chiave JSON, numero, etichetta
    ("manodopera", "1.", "MANODOPERA"),
    ("materiali", "2.", "MATERIALI"),
    ("mezzi_opera", "3.", "MEZZI D'OPERA"),
    ("varie", "4.", "VARIE"),
]
ETICHETTA_BREVE = {"manodopera": "Manodopera", "materiali": "Materiali",
                   "mezzi_opera": "Mezzi d'opera", "varie": "Varie"}
NOME_JSON = "analisi_nuovi_prezzi.json"
NOME_MD = "analisi_nuovi_prezzi.md"
NOME_XLSX = "analisi_nuovi_prezzi.xlsx"
DIR_GENERATO = "_generato"
MESI_VALIDITA_PREZZI = 12
# Metodo del professionista: percentuali fisse, non negoziabili dalla skill.
PCT_STANDARD = {"sicurezza_pct": 3.0, "spese_generali_pct": 15.0, "utile_pct": 10.0}
SOGLIA_CONSOLIDAMENTO = 60
SKILL_DIR = Path(__file__).resolve().parent.parent
MEMORIA_DEFAULT = SKILL_DIR / "memoria"


# ── aritmetica ──────────────────────────────────────────────────────────

def _d(x) -> Decimal:
    return Decimal(str(x))


def arr(x, dec: int = 2) -> Decimal:
    """Arrotondamento commerciale (half-up), come fa Excel."""
    q = Decimal(1).scaleb(-dec)
    return _d(x).quantize(q, rounding=ROUND_HALF_UP)


def calcola(analisi: dict, parametri: dict) -> dict:
    """Ricalcola tutto da una singola analisi. Non modifica l'input.

    Restituisce: righe per sezione (con importo e incidenza), totali di
    sezione, totale_a, sicurezza, spese_generali, totale_b, utile,
    totale_generale, prezzo_applicazione, incidenze, provvisorio, errori.
    """
    pct_sic = _d(parametri.get("sicurezza_pct", 3))
    pct_sg = _d(parametri.get("spese_generali_pct", 15))
    pct_ut = _d(parametri.get("utile_pct", 10))
    errori: list[str] = []
    for k, v in PCT_STANDARD.items():
        if _d(parametri.get(k, v)) != _d(v):
            errori.append(f"{analisi.get('codice')}: {k} = {parametri.get(k)} — il metodo usa sempre "
                          f"{_fmt_pct_param(v)}%; un'eccezione la autorizza il professionista, non la skill")
    sezioni_out: dict[str, dict] = {}
    totale_a = Decimal(0)
    provvisorio = False

    for chiave, numero, _ in SEZIONI:
        righe = analisi.get("sezioni", {}).get(chiave) or []
        righe_out = []
        tot = Decimal(0)
        for r in righe:
            q = r.get("quantita")
            c = r.get("costo_unitario")
            if q is None:
                errori.append(f"{analisi.get('codice')} riga {r.get('n')}: quantità mancante")
                q = 0
            if c is None:
                provvisorio = True
                importo = None
                errori.append(f"{analisi.get('codice')} riga {r.get('n')}: costo mancante — il metodo non ammette TBD: "
                              "proponi una stima e scrivi la fonte come «stima — …»")
            else:
                importo = arr(_d(q) * _d(c))
                tot += importo
            righe_out.append({**r, "importo": importo, "tbd": c is None})
        sezioni_out[chiave] = {"righe": righe_out, "totale": tot}
        totale_a += tot

    sicurezza = arr(totale_a * pct_sic / 100)
    spese = arr(totale_a * pct_sg / 100)
    totale_b = totale_a + sicurezza + spese
    utile = arr(totale_b * pct_ut / 100)
    totale_generale = totale_b + utile
    prezzo = arr(totale_generale)

    def inc(x):
        if x is None or prezzo == 0:
            return None
        return arr(_d(x) / prezzo * 100)

    for s in sezioni_out.values():
        s["incidenza"] = inc(s["totale"])
        for r in s["righe"]:
            r["incidenza"] = inc(r["importo"])
    incidenze = {k: sezioni_out[k]["incidenza"] for k, _, _ in SEZIONI}
    incidenze.update({"sicurezza": inc(sicurezza), "spese_generali": inc(spese), "utile": inc(utile),
                      "totale_a": inc(totale_a)})
    somma_inc = sum((v for k, v in incidenze.items() if k != "totale_a" and v is not None), Decimal(0))
    if prezzo and abs(somma_inc - 100) > Decimal("0.05"):
        errori.append(f"{analisi.get('codice')}: le incidenze sommano a {somma_inc}, non 100,00")

    conf = analisi.get("confronto") or {}
    if conf.get("prezzo_prezzario") and prezzo:
        scost = arr((prezzo - _d(conf["prezzo_prezzario"])) / _d(conf["prezzo_prezzario"]) * 100)
        classe = "BASSO" if abs(scost) <= 5 else "MEDIO" if abs(scost) <= 15 else "ALTO"
        conf = {**conf, "scostamento_pct_calcolato": scost, "classificazione_calcolata": classe}
        if classe == "ALTO" and not conf.get("spiegazione"):
            errori.append(f"{analisi.get('codice')}: scostamento {scost}% (ALTO) senza spiegazione")

    return {
        "sezioni": sezioni_out, "totale_a": totale_a, "sicurezza": sicurezza, "spese_generali": spese,
        "totale_b": totale_b, "utile": utile, "totale_generale": totale_generale,
        "prezzo_applicazione": prezzo, "incidenze": incidenze, "provvisorio": provvisorio,
        "confronto": conf, "errori": errori, "stime": conta_stime(analisi),
        "pct": {"sicurezza": pct_sic, "spese_generali": pct_sg, "utile": pct_ut},
    }


def is_stima(riga: dict) -> bool:
    return str(riga.get("fonte", "")).strip().lower().startswith("stima")


def conta_stime(analisi: dict) -> int:
    return sum(1 for k, _, _ in SEZIONI for r in (analisi.get("sezioni", {}).get(k) or []) if is_stima(r))


# ── formattazione ───────────────────────────────────────────────────────

def it(x, dec: int = 2, suffisso: str = "") -> str:
    if x is None:
        return "—"
    s = f"{arr(x, dec):,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", "")
    return s + suffisso


def pct(x) -> str:
    return "—" if x is None else it(x, 2, "%")


def _fmt_pct_param(v) -> str:
    v = _d(v)
    return it(v, 0) if v == v.to_integral() else it(v, 2)


def _testata(doc: dict, risultati: list[dict]) -> list[str]:
    p = doc.get("parametri", {})
    pz = doc.get("prezzario") or {}
    prezzario = f"{pz.get('regione', '?')} {pz.get('anno', '?')}" if pz else "non disponibile"
    par = (f"sicurezza {_fmt_pct_param(p.get('sicurezza_pct', 3))}% e spese generali "
           f"{_fmt_pct_param(p.get('spese_generali_pct', 15))}% su totale A, utile "
           f"{_fmt_pct_param(p.get('utile_pct', 10))}% su totale B ({p.get('fonte', 'metodo standard')})")
    generato = (doc.get("generato_il") or _dt.date.today().isoformat())[:10]
    righe = [
        f"# Analisi dei nuovi prezzi — {doc.get('documento', 'Computo metrico')} — {doc.get('gara', '')}".rstrip(" —"),
        "",
        f"**Prezzario:** {prezzario} · **Parametri:** {par} · **Stadio:** {doc.get('stadio', '—')} · **Generato:** {generato}",
    ]
    if doc.get("non_estimativo"):
        righe.append("**Documento di lavoro per il professionista: non va nella busta tecnica** "
                     "(computo non estimativo: nessun prezzo di questo file compare negli altri documenti del computo).")
    else:
        righe.append("**Documento di lavoro per il professionista: non va nella busta tecnica.**")
    n_stime = sum(r["stime"] for r in risultati)
    n_tbd = sum(1 for r in risultati if r["provvisorio"])
    righe.append("")
    if n_stime:
        righe.append(f"> {n_stime} {'costo stimato' if n_stime == 1 else 'costi stimati'} dalla skill (fonte «stima — …»), "
                     "elencati in «Da verificare» di ciascuna analisi. Tutte le voci si intendono da verificare dal professionista.")
    else:
        righe.append("> Nessun costo stimato: ogni valore ha una fonte documentale. Tutte le voci si intendono comunque da verificare dal professionista.")
    if n_tbd:
        righe.append(f"> ⚠ {n_tbd} analisi con costi mancanti: il metodo non lo ammette, completare con una stima dichiarata.")
    return righe


def rendi_md(doc: dict) -> str:
    risultati = [calcola(a, doc.get("parametri", {})) for a in doc.get("analisi", [])]
    out = _testata(doc, risultati)
    for a, r in zip(doc.get("analisi", []), risultati):
        um = a.get("unita_misura", "")
        out += ["", f"## {a.get('codice')} — {a.get('descrizione_sintetica', '')}", ""]
        meta = [f"**U.M.:** {um}"]
        for etich, chiave in (("Proposta", "proposta"), ("Criterio", "criterio"), ("Voce di computo", "voce_computo")):
            if a.get(chiave):
                meta.append(f"**{etich}:** {a[chiave]}")
        conf = r["confronto"]
        if a.get("voce_prezzario_analoga"):
            pp = f" ({it(conf['prezzo_prezzario'])} €/{um})" if conf.get("prezzo_prezzario") else ""
            meta.append(f"**Voce analoga del prezzario:** {a['voce_prezzario_analoga']}{pp}")
        out.append(" · ".join(meta))
        out += ["", f"**Descrizione estesa.** {a.get('descrizione_estesa', '')}", ""]
        out += ["| N. | Descrizione | U.M. | Quantità | Costo unitario | Importo | Incidenza | Fonte |",
                "|---|---|---|---|---|---|---|---|"]
        for chiave, numero, etichetta in SEZIONI:
            s = r["sezioni"][chiave]
            out.append(f"| **{numero}** | **{etichetta}** | | | | | | |")
            if not s["righe"]:
                out.append(f"| {numero}1 | nessuna | | | | 0,00 | 0,00% | |")
            for riga in s["righe"]:
                costo = "TBD" if riga["tbd"] else it(riga.get("costo_unitario"))
                out.append(f"| {riga.get('n', '')} | {riga.get('descrizione', '')} | {riga.get('um', '')} | "
                           f"{it(riga.get('quantita'), 3)} | {costo} | {it(riga['importo'])} | "
                           f"{pct(riga['incidenza'])} | {riga.get('fonte', '')} |")
            prov = " (provvisorio)" if any(x["tbd"] for x in s["righe"]) else ""
            out.append(f"| | *Totale {numero[0]} — {ETICHETTA_BREVE[chiave]}{prov}* | | | | "
                       f"**{it(s['totale'])}** | **{pct(s['incidenza'])}** | |")
        p = r["pct"]
        out += [
            f"| | **TOTALE A (1+2+3+4)** | | | | **{it(r['totale_a'])}** | **{pct(r['incidenze']['totale_a'])}** | |",
            f"| 5.0 | Incidenza sicurezza {_fmt_pct_param(p['sicurezza'])}% su totale A | | | | {it(r['sicurezza'])} | {pct(r['incidenze']['sicurezza'])} | |",
            f"| 5.1 | Spese generali {_fmt_pct_param(p['spese_generali'])}% su totale A | | | | {it(r['spese_generali'])} | {pct(r['incidenze']['spese_generali'])} | |",
            f"| | **TOTALE B (A + 5.0 + 5.1)** | | | | **{it(r['totale_b'])}** | | |",
            f"| 6. | Utile d'impresa {_fmt_pct_param(p['utile'])}% su totale B | | | | {it(r['utile'])} | {pct(r['incidenze']['utile'])} | |",
            f"| | **TOTALE GENERALE** | | | | **{it(r['totale_generale'])}** | **100,00%** | |",
            f"| | **PREZZO DI APPLICAZIONE** | €/{um} | | | **{it(r['prezzo_applicazione'])}"
            f"{' (provvisorio)' if r['provvisorio'] else ''}** | | |",
            "",
        ]
        inc = r["incidenze"]
        out.append("**Incidenze:** " + " · ".join([
            f"manodopera {pct(inc['manodopera'])}", f"materiali {pct(inc['materiali'])}",
            f"mezzi d'opera {pct(inc['mezzi_opera'])}", f"varie {pct(inc['varie'])}",
            f"sicurezza {pct(inc['sicurezza'])}", f"spese generali {pct(inc['spese_generali'])}",
            f"utile {pct(inc['utile'])}"]) + ".")
        if conf.get("prezzo_prezzario"):
            segno = "+" if conf["scostamento_pct_calcolato"] >= 0 else "−"
            riga = (f"**Confronto con la voce analoga:** {conf.get('codice', a.get('voce_prezzario_analoga'))}, "
                    f"{it(conf['prezzo_prezzario'])} €/{um} → scostamento {segno}{it(abs(conf['scostamento_pct_calcolato']))}% "
                    f"({conf['classificazione_calcolata']}).")
            if conf.get("spiegazione"):
                sp = conf["spiegazione"].strip().rstrip(".")
                riga += f" {sp[:1].upper() + sp[1:]}."
            if r["provvisorio"]:
                riga += " Il confronto è provvisorio: ci sono componenti TBD."
            out.append(riga)
        if a.get("note"):
            out += ["", "**Note**"] + [f"- {n}" for n in a["note"]]
        if a.get("da_verificare"):
            out += ["", "**Da verificare**"] + [f"- {n}" for n in a["da_verificare"]]
    return "\n".join(out).rstrip() + "\n"


# ── Excel (layout del foglio di riferimento, con formule) ───────────────

def rendi_xlsx(doc: dict, destinazione: Path) -> bool:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("openpyxl non installato: Excel saltato (pip install openpyxl).", file=sys.stderr)
        return False

    wb = Workbook()
    wb.remove(wb.active)
    grassetto = Font(bold=True)
    grigio = PatternFill("solid", fgColor="EEEEEE")
    p = doc.get("parametri", {})
    riepilogo = []

    for a in doc.get("analisi", []):
        r = calcola(a, p)
        ws = wb.create_sheet(title=a.get("codice", "NP")[:31])
        larghezze = [7, 58, 34, 8, 12, 14, 14, 14]
        for i, w in enumerate(larghezze, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
        ws["A1"] = "ANALISI DEI PREZZI MIGLIORIE"; ws["A1"].font = grassetto
        ws["F1"] = "CODICE NUOVO PREZZO"; ws["F1"].font = grassetto
        ws["H1"] = a.get("codice"); ws["H1"].font = grassetto
        ws["A2"] = "DESCRIZIONE"; ws["A2"].font = grassetto
        ws["B2"] = a.get("descrizione_sintetica", ""); ws["B2"].font = grassetto
        ws["A3"] = "Descrizione estesa"
        ws["B3"] = a.get("descrizione_estesa", "")
        ws["B3"].alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells("B3:H3"); ws.row_dimensions[3].height = max(30, 15 * (1 + len(a.get("descrizione_estesa", "")) // 110))
        ws["A4"] = "U.M."; ws["B4"] = a.get("unita_misura", "")
        if a.get("voce_prezzario_analoga"):
            ws["D4"] = "Voce analoga prezzario"; ws["F4"] = a["voce_prezzario_analoga"]
        intest = ["N.", "Descrizione", "Fonte", "unità di misura", "quantità", "costo unitario", "importo parziale", "importo totale"]
        for col, t in enumerate(intest, 1):
            c = ws.cell(row=6, column=col, value=t); c.font = grassetto; c.fill = grigio
            c.alignment = Alignment(wrap_text=True, horizontal="center")
        riga = 7
        celle_totali = []
        celle_sezioni = {}
        for chiave, numero, etichetta in SEZIONI:
            ws.cell(row=riga, column=1, value=numero).font = grassetto
            ws.cell(row=riga, column=2, value=etichetta).font = grassetto
            riga += 1
            inizio = riga
            righe = r["sezioni"][chiave]["righe"]
            if not righe:
                ws.cell(row=riga, column=1, value=f"{numero}1"); ws.cell(row=riga, column=2, value="nessuna")
                ws.cell(row=riga, column=7, value=0); riga += 1
            for x in righe:
                ws.cell(row=riga, column=1, value=x.get("n"))
                ws.cell(row=riga, column=2, value=x.get("descrizione")).alignment = Alignment(wrap_text=True)
                ws.cell(row=riga, column=3, value=x.get("fonte")).alignment = Alignment(wrap_text=True)
                ws.cell(row=riga, column=4, value=x.get("um"))
                ws.cell(row=riga, column=5, value=float(x.get("quantita") or 0)).number_format = "0.000"
                if x["tbd"]:
                    ws.cell(row=riga, column=6, value="TBD").font = Font(bold=True, color="C00000")
                    ws.cell(row=riga, column=7, value=0).number_format = "0.00"
                else:
                    ws.cell(row=riga, column=6, value=float(x["costo_unitario"])).number_format = "0.00"
                    ws.cell(row=riga, column=7, value=f"=ROUND(E{riga}*F{riga},2)").number_format = "0.00"
                riga += 1
            fine = riga - 1
            ws.cell(row=riga, column=2, value=f"Totale {numero[0]} — {ETICHETTA_BREVE[chiave]}").font = grassetto
            ws.cell(row=riga, column=8, value=f"=SUM(G{inizio}:G{fine})").number_format = "0.00"
            ws.cell(row=riga, column=8).font = grassetto
            celle_totali.append(f"H{riga}")
            celle_sezioni[chiave] = riga
            riga += 1
            ws.cell(row=riga, column=7, value="incidenza")
            celle_sezioni[chiave + "_inc"] = riga
            riga += 1
        riga_a = riga
        ws.cell(row=riga, column=2, value="SOMMANO (1+2+3+4) — TOTALE A").font = grassetto
        ws.cell(row=riga, column=8, value="=" + "+".join(celle_totali)).number_format = "0.00"; riga += 1
        ws.cell(row=riga, column=1, value="5.0"); ws.cell(row=riga, column=2, value="INCIDENZA SICUREZZA su TOTALE A")
        ws.cell(row=riga, column=6, value=float(_d(p.get("sicurezza_pct", 3)) / 100)).number_format = "0.00%"
        ws.cell(row=riga, column=8, value=f"=ROUND(H{riga_a}*F{riga},2)").number_format = "0.00"; riga_sic = riga; riga += 1
        ws.cell(row=riga, column=1, value="5.1"); ws.cell(row=riga, column=2, value="SPESE GENERALI su TOTALE A")
        ws.cell(row=riga, column=6, value=float(_d(p.get("spese_generali_pct", 15)) / 100)).number_format = "0.00%"
        ws.cell(row=riga, column=8, value=f"=ROUND(H{riga_a}*F{riga},2)").number_format = "0.00"; riga_sg = riga; riga += 1
        riga_b = riga
        ws.cell(row=riga, column=2, value="SOMMANO (TOTALE A + 5.0 + 5.1) — TOTALE B").font = grassetto
        ws.cell(row=riga, column=8, value=f"=H{riga_a}+H{riga_sic}+H{riga_sg}").number_format = "0.00"; riga += 1
        ws.cell(row=riga, column=1, value="6."); ws.cell(row=riga, column=2, value="UTILE DI IMPRESA su TOTALE B")
        ws.cell(row=riga, column=6, value=float(_d(p.get("utile_pct", 10)) / 100)).number_format = "0.00%"
        ws.cell(row=riga, column=8, value=f"=ROUND(H{riga_b}*F{riga},2)").number_format = "0.00"; riga_ut = riga; riga += 1
        riga_tg = riga
        ws.cell(row=riga, column=2, value="TOTALE GENERALE").font = grassetto
        ws.cell(row=riga, column=8, value=f"=H{riga_b}+H{riga_ut}").number_format = "0.00"; riga += 1
        ws.cell(row=riga, column=2, value="PREZZO DI APPLICAZIONE").font = grassetto
        ws.cell(row=riga, column=6, value=f"€/{a.get('unita_misura', '')}")
        ws.cell(row=riga, column=7, value=f"=ROUND(H{riga_tg},2)").number_format = "0.00"
        ws.cell(row=riga, column=7).font = grassetto
        if r["provvisorio"]:
            ws.cell(row=riga, column=8, value="PROVVISORIO (componenti TBD)").font = Font(bold=True, color="C00000")
        # incidenze come formule sul totale generale
        for chiave, _, _ in SEZIONI:
            ws.cell(row=celle_sezioni[chiave + "_inc"], column=8,
                    value=f"=IF(H{riga_tg}=0,0,H{celle_sezioni[chiave]}/H{riga_tg})").number_format = "0.00%"
        for rr in (riga_sic, riga_sg, riga_ut):
            ws.cell(row=rr, column=7, value=f"=IF(H{riga_tg}=0,0,H{rr}/H{riga_tg})").number_format = "0.00%"
        riga += 2
        for titolo, elenco in (("Note", a.get("note") or []), ("Da verificare", a.get("da_verificare") or [])):
            if elenco:
                ws.cell(row=riga, column=2, value=titolo).font = grassetto; riga += 1
                for n in elenco:
                    ws.cell(row=riga, column=2, value=n).alignment = Alignment(wrap_text=True)
                    ws.merge_cells(start_row=riga, start_column=2, end_row=riga, end_column=8); riga += 1
        riepilogo.append([a.get("codice"), a.get("descrizione_sintetica"), a.get("unita_misura"),
                          float(r["prezzo_applicazione"]), float(r["incidenze"]["manodopera"] or 0) / 100,
                          "INCOMPLETO (costi mancanti)" if r["provvisorio"] else
                          (f"{r['stime']} stime da verificare" if r["stime"] else "completo")])

    ws = wb.create_sheet(title="Riepilogo", index=0)
    for col, t in enumerate(["Codice", "Descrizione sintetica", "U.M.", "Prezzo di applicazione", "Incidenza manodopera", "Stato"], 1):
        c = ws.cell(row=1, column=col, value=t); c.font = grassetto; c.fill = grigio
    for i, rr in enumerate(riepilogo, 2):
        for col, v in enumerate(rr, 1):
            c = ws.cell(row=i, column=col, value=v)
            if col == 4: c.number_format = "0.00"
            if col == 5: c.number_format = "0.00%"
    for col, w in zip("ABCDEF", [12, 70, 8, 20, 20, 14]):
        ws.column_dimensions[col].width = w
    pz = doc.get("prezzario") or {}
    ws.cell(row=len(riepilogo) + 3, column=1, value=f"Prezzario {pz.get('regione', '?')} {pz.get('anno', '?')} · "
            f"parametri: {p.get('fonte', 'metodo standard')} · generato {(doc.get('generato_il') or '')[:10]} · "
            "documento di lavoro, non va nella busta tecnica")
    wb.save(destinazione)
    return True


# ── verifica ────────────────────────────────────────────────────────────

RE_SEZIONE = re.compile(r"^## (NP\S*|\S+) — ", re.M)


def _num_it(s: str):
    s = s.strip().strip("*").replace("(provvisorio)", "").strip()
    s = s.replace("%", "").replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return None


def _totali_dal_md(md: str) -> dict[str, dict]:
    """Per ogni sezione '## CODICE — …' estrae TOTALE A, TOTALE B, TOTALE GENERALE e PREZZO DI APPLICAZIONE."""
    out = {}
    blocchi = re.split(r"^## ", md, flags=re.M)[1:]
    for b in blocchi:
        codice = b.split(" — ", 1)[0].strip()
        tot = {}
        for etich, chiave in (("TOTALE A", "totale_a"), ("TOTALE B", "totale_b"),
                              ("TOTALE GENERALE", "totale_generale"), ("PREZZO DI APPLICAZIONE", "prezzo_applicazione")):
            m = re.search(r"\| \*\*" + re.escape(etich) + r"[^|]*\*\* \|[^|]*\|[^|]*\|[^|]*\| \*\*([^|]+)\*\* \|", b)
            if m:
                tot[chiave] = _num_it(m.group(1))
        out[codice] = tot
    return out


def verifica(cartella: Path) -> int:
    doc = _carica(cartella)
    problemi: list[str] = []
    if doc.get("schema") != SCHEMA:
        problemi.append(f"schema «{doc.get('schema')}» diverso da {SCHEMA}")
    codici = [a.get("codice") for a in doc.get("analisi", [])]
    if len(set(codici)) != len(codici):
        problemi.append("codici duplicati: " + ", ".join(c for c in codici if codici.count(c) > 1))
    risultati = {}
    for a in doc.get("analisi", []):
        for campo in ("codice", "descrizione_sintetica", "descrizione_estesa", "unita_misura"):
            if not a.get(campo):
                problemi.append(f"{a.get('codice', '?')}: campo «{campo}» vuoto")
        for chiave, _, _ in SEZIONI:
            for x in a.get("sezioni", {}).get(chiave) or []:
                if not x.get("fonte"):
                    problemi.append(f"{a.get('codice')} riga {x.get('n')}: fonte mancante")
                if re.search(r"\bTBD\b|da definire", str(x.get("fonte", "")) + " " + str(x.get("descrizione", "")), re.I):
                    problemi.append(f"{a.get('codice')} riga {x.get('n')}: «TBD» nel testo — il metodo non lo ammette: stima dichiarata")
                if re.search(r"prezz[io] di mercato|indagine di mercato", str(x.get("fonte", "")), re.I) and not is_stima(x):
                    problemi.append(f"{a.get('codice')} riga {x.get('n')}: fonte «{x.get('fonte')}» è una stima travestita — scrivila come «stima — …»")
        r = calcola(a, doc.get("parametri", {}))
        problemi += r["errori"]
        risultati[a.get("codice")] = r
        for chiave, _, _ in SEZIONI:
            for x in a.get("sezioni", {}).get(chiave) or []:
                if is_stima(x):
                    problemi.append(f"{a.get('codice')} riga {x.get('n')}: costo stimato — {x.get('fonte')} (avviso)")
        for x in a.get("sezioni", {}).get("materiali") or []:
            if re.search(r"\bsfrid", str(x.get("descrizione", "")), re.I) and (x.get("quantita") or 0) <= 0.2 and not re.search(r"compres", str(x.get("descrizione", "")), re.I):
                problemi.append(f"{a.get('codice')} riga {x.get('n')}: sembra una riga di sfrido a sé — lo sfrido va nella quantità del materiale (avviso)")
        inc_m = r["incidenze"]["manodopera"]
        if inc_m is not None and not r["provvisorio"]:
            if inc_m < 10:
                problemi.append(f"{a.get('codice')}: incidenza manodopera {inc_m}% < 10% — verificare che non manchi la posa (avviso)")
            if inc_m > 60:
                problemi.append(f"{a.get('codice')}: incidenza manodopera {inc_m}% > 60% — verificare materiali (avviso)")
    md_path = cartella / NOME_MD
    if md_path.exists():
        dal_md = _totali_dal_md(md_path.read_text(encoding="utf-8"))
        for codice, r in risultati.items():
            if codice not in dal_md:
                problemi.append(f"{codice}: sezione assente nel markdown")
                continue
            for chiave in ("totale_a", "totale_b", "totale_generale", "prezzo_applicazione"):
                v = dal_md[codice].get(chiave)
                if v is None:
                    problemi.append(f"{codice}: «{chiave}» non trovato nel markdown")
                elif abs(v - r[chiave]) > Decimal("0.02"):
                    problemi.append(f"{codice}: {chiave} nel markdown = {v}, ricalcolato = {r[chiave]}")
        for codice in dal_md:
            if codice not in risultati:
                problemi.append(f"{codice}: nel markdown ma non nel JSON")
    else:
        problemi.append(f"{NOME_MD} assente (avviso)")

    gravi = [p for p in problemi if "(avviso)" not in p]
    for codice, r in risultati.items():
        stato = "INCOMPLETO" if r["provvisorio"] else (f"{r['stime']} stime" if r["stime"] else "fonti complete")
        print(f"{codice}: prezzo di applicazione {it(r['prezzo_applicazione'])} €/{_um(doc, codice)} — "
              f"manodopera {pct(r['incidenze']['manodopera'])} — {stato}")
    for p in problemi:
        print(("⚠ " if "(avviso)" in p else "✗ ") + p)
    print("Verifica: " + ("OK" if not gravi else f"{len(gravi)} problemi") + (f", {len(problemi) - len(gravi)} avvisi" if len(problemi) > len(gravi) else ""))
    return 1 if gravi else 0


def _um(doc, codice):
    return next((a.get("unita_misura", "") for a in doc.get("analisi", []) if a.get("codice") == codice), "")


# ── apprendimento ───────────────────────────────────────────────────────

def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _slug(s: str) -> str:
    return re.sub(r"\s+", "-", _norm(s))[:80]


def _indice_righe(a: dict) -> dict[str, dict]:
    out = {}
    for chiave, _, _ in SEZIONI:
        for x in a.get("sezioni", {}).get(chiave) or []:
            out[f"{chiave}|{_norm(x.get('descrizione', ''))}"] = {**x, "_sezione": chiave}
    return out


def differenze(generato: dict, corrente: dict) -> list[dict]:
    """Confronta due JSON e restituisce le differenze come eventi tipizzati."""
    ev = []
    pg, pc = generato.get("parametri", {}), corrente.get("parametri", {})
    for k in ("sicurezza_pct", "spese_generali_pct", "utile_pct"):
        if _d(pg.get(k, 0)) != _d(pc.get(k, 0)):
            ev.append({"tipo": "parametro", "campo": k, "da": pg.get(k), "a": pc.get(k), "fonte": pc.get("fonte")})
    gen = {a.get("codice"): a for a in generato.get("analisi", [])}
    cur = {a.get("codice"): a for a in corrente.get("analisi", [])}
    for codice in cur.keys() - gen.keys():
        ev.append({"tipo": "analisi_aggiunta", "codice": codice})
    for codice in gen.keys() - cur.keys():
        ev.append({"tipo": "analisi_tolta", "codice": codice})
    for codice in gen.keys() & cur.keys():
        g, c = gen[codice], cur[codice]
        desc = c.get("descrizione_sintetica", "")
        for campo in ("descrizione_sintetica", "descrizione_estesa", "unita_misura"):
            if (g.get(campo) or "") != (c.get(campo) or ""):
                ev.append({"tipo": "testo", "codice": codice, "campo": campo, "da": g.get(campo), "a": c.get(campo)})
        ig, ic = _indice_righe(g), _indice_righe(c)
        for k in ic.keys() - ig.keys():
            x = ic[k]
            ev.append({"tipo": "riga_aggiunta", "codice": codice, "lavorazione": desc, "sezione": x["_sezione"],
                       "descrizione": x.get("descrizione"), "quantita": x.get("quantita"), "um": x.get("um"),
                       "costo": x.get("costo_unitario"), "fonte": x.get("fonte")})
        for k in ig.keys() - ic.keys():
            x = ig[k]
            ev.append({"tipo": "riga_tolta", "codice": codice, "lavorazione": desc, "sezione": x["_sezione"],
                       "descrizione": x.get("descrizione")})
        for k in ig.keys() & ic.keys():
            xg, xc = ig[k], ic[k]
            if xg.get("quantita") != xc.get("quantita"):
                ev.append({"tipo": "quantita", "codice": codice, "lavorazione": desc, "sezione": xc["_sezione"],
                           "descrizione": xc.get("descrizione"), "um": xc.get("um"), "da": xg.get("quantita"), "a": xc.get("quantita")})
            if xg.get("costo_unitario") != xc.get("costo_unitario"):
                ev.append({"tipo": "costo", "codice": codice, "lavorazione": desc, "sezione": xc["_sezione"],
                           "descrizione": xc.get("descrizione"), "um": xc.get("um"), "da": xg.get("costo_unitario"),
                           "a": xc.get("costo_unitario"), "fonte": xc.get("fonte"), "codice_prezzario": _codice_prezzario(xc.get("fonte")),
                           "era_stima": is_stima(xg)})
    return ev


def _codice_prezzario(fonte):
    m = re.search(r"—\s*([A-Z]{2,4}\d{2}_[A-Z0-9._]+)", fonte or "")
    return m.group(1) if m else None


def lezioni_candidate(ev: list[dict], gara: str, oggi: str) -> list[str]:
    """Trasforma gli eventi in bozze di lezione (da rifinire a mano: il perché lo sa chi legge la nota)."""
    prov = f"[{oggi} · gara {gara or '?'} · bozza→approvato]"
    out = []
    for e in ev:
        t = e["tipo"]
        if t == "parametro":
            out.append(f"- {prov} **Percentuali e parametri · {e['campo']}**: da {e['da']} a {e['a']}"
                       f"{' (fonte: ' + e['fonte'] + ')' if e.get('fonte') else ''}. Regola: vale solo per questa "
                       "stazione appaltante/gara finché non si ripete — annotare dove. (confermata 1×)")
        elif t == "riga_aggiunta":
            out.append(f"- {prov} **{ETICHETTA_BREVE[e['sezione']]} · {e['lavorazione']}**: il professionista ha aggiunto "
                       f"«{e['descrizione']}» ({it(e.get('quantita'), 3)} {e.get('um', '')}). Regola: in questa lavorazione "
                       f"non dimenticare {e['descrizione']}. (confermata 1×)")
        elif t == "riga_tolta":
            out.append(f"- {prov} **{ETICHETTA_BREVE[e['sezione']]} · {e['lavorazione']}**: tolta la riga «{e['descrizione']}». "
                       "Regola: [scrivere perché — solo se il motivo è generale]. (confermata 1×)")
        elif t == "quantita":
            out.append(f"- {prov} **{ETICHETTA_BREVE[e['sezione']]} · {e['lavorazione']}**: «{e['descrizione']}» da "
                       f"{it(e['da'], 3)} a {it(e['a'], 3)} {e.get('um', '')}. Regola: [generalizzare: per quale famiglia "
                       "di lavorazioni vale questa quantità e perché]. (confermata 1×)")
        elif t == "costo":
            out.append(f"- {prov} **{ETICHETTA_BREVE[e['sezione']]} · prezzo**: «{e['descrizione']}» da "
                       f"{it(e['da'])} a {it(e['a'])} €/{e.get('um', '')} ({e.get('fonte') or 'fonte non indicata'}"
                       f"{'; la skill aveva stimato' if e.get('era_stima') else ''}). "
                       "→ registrato in prezzi_appresi.json. (confermata 1×)")
        elif t == "testo":
            out.append(f"- {prov} **Descrizioni e forma · {e['codice']}**: {e['campo']} riscritta dal professionista. "
                       "Regola: [cosa cambia nel modo di scrivere]. (confermata 1×)")
        elif t in ("analisi_aggiunta", "analisi_tolta"):
            out.append(f"- {prov} **Descrizioni e forma**: analisi {e['codice']} {'aggiunta' if t == 'analisi_aggiunta' else 'tolta'} "
                       "dal professionista. Regola: [perché il computo ne aveva bisogno / non ne aveva bisogno]. (confermata 1×)")
    return out


TEMPLATE_LEZIONI = """# Lezioni — analisi nuovi prezzi

Regole ricavate dalle correzioni del professionista. Una riga per
lezione; stessa regola → aggiorna «confermata n×», non duplicare.
Oltre ~60 righe: consolidare (SKILL.md, «Apprendimento»). Le righe in
«In attesa di rifinitura» le scrive `analisi_np.py apprendi`: vanno
rilette, generalizzate (compilando i segnaposto fra parentesi quadre) e
spostate nella sezione giusta; una riga con un segnaposto non è ancora
una regola.

## Manodopera

## Materiali

## Mezzi d'opera

## Varie

## Percentuali e parametri

## Descrizioni e forma

## In attesa di rifinitura
"""


def registra_candidate(memoria: Path, candidate: list[str]) -> int:
    """Accoda le lezioni candidate a memoria/lezioni.md (sezione «In attesa
    di rifinitura»), senza duplicare una riga già presente (confronto sul
    testo senza provenienza e contatore)."""
    if not candidate:
        return 0
    memoria.mkdir(parents=True, exist_ok=True)
    f = memoria / "lezioni.md"
    testo = f.read_text(encoding="utf-8") if f.exists() else TEMPLATE_LEZIONI
    if "## In attesa di rifinitura" not in testo:
        testo = testo.rstrip() + "\n\n## In attesa di rifinitura\n"

    def nucleo(r: str) -> str:
        r = re.sub(r"^- \[[^\]]*\]\s*", "", r)
        return re.sub(r"\s*\(confermata \d+×\)\s*$", "", r).strip()

    presenti = {nucleo(l) for l in testo.splitlines() if l.startswith("- [")}
    nuove = [c for c in candidate if nucleo(c) not in presenti]
    if nuove:
        testo = testo.rstrip() + "\n" + "\n".join(nuove) + "\n"
        f.write_text(testo, encoding="utf-8")
    return len(nuove)


def _carica_memoria_prezzi(memoria: Path) -> dict:
    f = memoria / "prezzi_appresi.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return {"schema": "prezzi-appresi/1.0", "voci": []}


def aggiorna_prezzi(memoria: Path, ev: list[dict], corrente: dict, gara: str, oggi: str) -> int:
    dati = _carica_memoria_prezzi(memoria)
    pz = corrente.get("prezzario") or {}
    n = 0
    for e in ev:
        if e["tipo"] != "costo" or e.get("a") is None:
            continue
        chiave = _norm(e["descrizione"])
        esistente = next((v for v in dati["voci"] if v["chiave"] == chiave and v.get("regione") == pz.get("regione")), None)
        voce = {"chiave": chiave, "descrizione": e["descrizione"], "tipo": e["sezione"], "um": e.get("um"),
                "prezzo": e["a"], "codice_prezzario": e.get("codice_prezzario"), "regione": pz.get("regione"),
                "anno": pz.get("anno"), "gara": gara, "data": oggi,
                "fonte": f"correzione professionista ({e.get('fonte')})" if e.get("fonte") else "correzione professionista",
                "conferme": (esistente or {}).get("conferme", 0) + 1}
        if esistente:
            dati["voci"].remove(esistente)
        dati["voci"].append(voce)
        n += 1
    if n:
        memoria.mkdir(parents=True, exist_ok=True)
        (memoria / "prezzi_appresi.json").write_text(json.dumps(dati, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return n


def archivia(memoria: Path, corrente: dict, md: str, modificati: set[str], gara: str, oggi: str) -> list[Path]:
    dest = memoria / "analisi_approvate"
    dest.mkdir(parents=True, exist_ok=True)
    pz = corrente.get("prezzario") or {}
    blocchi = {b.split(" — ", 1)[0].strip(): "## " + b for b in re.split(r"^## ", md, flags=re.M)[1:]}
    scritti = []
    for a in corrente.get("analisi", []):
        r = calcola(a, corrente.get("parametri", {}))
        codice = a.get("codice")
        inc = {k: float(r["incidenze"][k] or 0) for k, _, _ in SEZIONI}
        tag = a.get("tag") or [w for w in re.findall(r"[a-zà-ù]{4,}", a.get("descrizione_sintetica", "").lower())
                               if w not in ("fornitura", "posa", "opera", "compreso", "compresi")][:8]
        front = {
            "codice": codice, "descrizione_sintetica": a.get("descrizione_sintetica"), "tag": tag,
            "unita_misura": a.get("unita_misura"), "prezzo_applicazione": float(r["prezzo_applicazione"]),
            "provvisorio": r["provvisorio"], "incidenze": inc, "regione": pz.get("regione"),
            "anno_prezzario": pz.get("anno"), "gara": gara, "deliverable_id": corrente.get("deliverable_id"),
            "approvata_il": oggi, "voce_prezzario_analoga": a.get("voce_prezzario_analoga"),
            "modificata_dal_professionista": codice in modificati,
        }
        testo = "---\n" + "\n".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in front.items()) + "\n---\n\n"
        testo += blocchi.get(codice, f"## {codice} — {a.get('descrizione_sintetica', '')}\n") + "\n"
        f = dest / f"{_slug(codice + ' ' + (a.get('descrizione_sintetica') or ''))}.md"
        f.write_text(testo, encoding="utf-8")
        scritti.append(f)
    return scritti


def apprendi(cartella: Path, archivia_flag: bool, gara: str | None, memoria: Path) -> int:
    corrente = _carica(cartella)
    gara = gara or corrente.get("gara") or cartella.resolve().parents[2].name
    oggi = _dt.date.today().isoformat()
    f_gen = cartella / DIR_GENERATO / NOME_JSON
    if not f_gen.exists():
        print(f"Nessuna copia in {f_gen}: senza il JSON generato non so cosa ha cambiato il professionista.")
        ev = []
    else:
        generato = json.loads(f_gen.read_text(encoding="utf-8"))
        ev = differenze(generato, corrente)
    if not ev:
        print("Nessuna differenza fra generato e approvato: niente da imparare da questo stadio (le analisi valgono come confermate).")
    else:
        candidate = lezioni_candidate(ev, gara, oggi)
        print(f"{len(ev)} differenze. Lezioni candidate:\n")
        for riga in candidate:
            print(riga)
        nuove = registra_candidate(memoria, candidate)
        print(f"\n{nuove} nuove righe in {memoria / 'lezioni.md'} («In attesa di rifinitura»): rileggile, compila i "
              "segnaposto fra parentesi quadre con il perché e spostale nella sezione della componente.")
        n = aggiorna_prezzi(memoria, ev, corrente, gara, oggi)
        if n:
            print(f"\n{n} prezzi corretti dal professionista registrati in {memoria / 'prezzi_appresi.json'}.")
    if archivia_flag:
        md = (cartella / NOME_MD).read_text(encoding="utf-8") if (cartella / NOME_MD).exists() else ""
        modificati = {e["codice"] for e in ev if "codice" in e}
        scritti = archivia(memoria, corrente, md, modificati, gara, oggi)
        print(f"\n{len(scritti)} analisi archiviate in {memoria / 'analisi_approvate'}:")
        for f in scritti:
            print(f"  {f.name}")
    return 0


# ── memoria stato ───────────────────────────────────────────────────────

RE_LEZIONE = re.compile(r"^- \[(\d{4}-\d{2}-\d{2})[^\]]*\].*?\(confermata (\d+)×\)", re.M | re.S)


def memoria_stato(memoria: Path) -> int:
    print(f"Memoria: {memoria}")
    f_lez = memoria / "lezioni.md"
    if f_lez.exists():
        testo = f_lez.read_text(encoding="utf-8")
        righe = [l for l in testo.splitlines() if l.startswith("- [")]
        conferme = [int(m.group(2)) for m in RE_LEZIONE.finditer(testo)]
        print(f"Lezioni: {len(righe)}" + (f" — SOGLIA DI CONSOLIDAMENTO SUPERATA ({SOGLIA_CONSOLIDAMENTO})" if len(righe) > SOGLIA_CONSOLIDAMENTO else ""))
        sezione = None
        for l in testo.splitlines():
            if l.startswith("## "):
                sezione = l[3:].strip(); n = sum(1 for x in testo.split(l, 1)[1].split("\n## ")[0].splitlines() if x.startswith("- ["))
                print(f"  {sezione}: {n}")
        mature = [m.group(0).splitlines()[0][:120] for m in RE_LEZIONE.finditer(testo) if int(m.group(2)) >= 3]
        if mature:
            print(f"Candidate alla promozione in references/metodo.md (confermate ≥3×): {len(mature)}")
            for m in mature:
                print("  " + m)
        aperte = len(re.findall(r"\[(?:scrivere|generalizzare|cosa cambia|perché)", testo))
        in_attesa = sum(1 for l in testo.split("## In attesa di rifinitura", 1)[-1].splitlines() if l.startswith("- [")) \
            if "## In attesa di rifinitura" in testo else 0
        if aperte or in_attesa:
            print(f"⚠ {in_attesa} lezioni in attesa di rifinitura, {aperte} con segnaposto da compilare: "
                  "non sono ancora regole.")
    else:
        print("Lezioni: nessuna (memoria/lezioni.md non esiste ancora)")
    dati = _carica_memoria_prezzi(memoria)
    oggi = _dt.date.today()
    scaduti = [v for v in dati["voci"] if (oggi - _dt.date.fromisoformat(v["data"])).days > 30 * MESI_VALIDITA_PREZZI]
    print(f"Prezzi appresi: {len(dati['voci'])}" + (f" — {len(scaduti)} più vecchi di {MESI_VALIDITA_PREZZI} mesi (da riverificare)" if scaduti else ""))
    arch = sorted((memoria / "analisi_approvate").glob("*.md")) if (memoria / "analisi_approvate").exists() else []
    print(f"Analisi approvate archiviate: {len(arch)}")
    if arch:
        inc = {k: [] for k, _, _ in SEZIONI}
        for f in arch:
            m = re.search(r'^incidenze: (\{.*\})$', f.read_text(encoding="utf-8"), re.M)
            if m:
                try:
                    d = json.loads(m.group(1))
                    for k in inc:
                        if k in d:
                            inc[k].append(d[k])
                except Exception:
                    pass
        print("Incidenze osservate (min–max % sulle analisi approvate):")
        for k, v in inc.items():
            if v:
                print(f"  {ETICHETTA_BREVE[k]}: {min(v):.1f}–{max(v):.1f}%")
    return 0


# ── I/O ─────────────────────────────────────────────────────────────────

def _carica(cartella: Path) -> dict:
    f = cartella / NOME_JSON
    if not f.exists():
        sys.exit(f"{f} non trovato.")
    return json.loads(f.read_text(encoding="utf-8"))


def rendi(cartella: Path, solo_xlsx: bool = False) -> int:
    doc = _carica(cartella)
    if not solo_xlsx:
        (cartella / NOME_MD).write_text(rendi_md(doc), encoding="utf-8")
        print(f"scritto {cartella / NOME_MD}")
        # La copia «generato» è la bozza come l'ha scritta la skill: si
        # (ri)scrive solo allo stadio bozza, mai dal definitivo, altrimenti
        # il confronto generato/approvato perderebbe le correzioni.
        if (doc.get("stadio") or "bozza") == "bozza":
            gen = cartella / DIR_GENERATO
            gen.mkdir(exist_ok=True)
            shutil.copy(cartella / NOME_JSON, gen / NOME_JSON)
            print(f"copia per l'apprendimento in {gen / NOME_JSON}")
    if rendi_xlsx(doc, cartella / NOME_XLSX):
        print(f"scritto {cartella / NOME_XLSX}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nome in ("rendi", "xlsx", "verifica"):
        s = sub.add_parser(nome); s.add_argument("cartella", nargs="?", default=".")
    s = sub.add_parser("apprendi"); s.add_argument("cartella", nargs="?", default=".")
    s.add_argument("--archivia", action="store_true"); s.add_argument("--gara"); s.add_argument("--memoria", default=str(MEMORIA_DEFAULT))
    s = sub.add_parser("memoria"); s.add_argument("azione", choices=["stato"]); s.add_argument("--memoria", default=str(MEMORIA_DEFAULT))
    a = ap.parse_args(argv)
    if a.cmd == "rendi":
        return rendi(Path(a.cartella))
    if a.cmd == "xlsx":
        return rendi(Path(a.cartella), solo_xlsx=True)
    if a.cmd == "verifica":
        return verifica(Path(a.cartella))
    if a.cmd == "apprendi":
        return apprendi(Path(a.cartella), a.archivia, a.gara, Path(a.memoria))
    if a.cmd == "memoria":
        return memoria_stato(Path(a.memoria))
    return 2


if __name__ == "__main__":
    sys.exit(main())
