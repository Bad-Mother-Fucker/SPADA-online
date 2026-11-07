#!/usr/bin/env python3
"""computo_primus.py — definitivo del computo metrico → file per ACCA PriMus.

Dal definitivo approvato (3_definitivo.md) scrive accanto a lui:
  <base>.xpwe   formato di interscambio XML di PriMus (File › Importa ›
                XPWE): elenco prezzi + voci di computo, con criteri e
                sub-criteri del disciplinare come Super categorie e
                Categorie;
  <base>.xlsx   lo stesso computo in Excel, nell'ordine delle colonne del
                computo PriMus (N.ord, Tariffa, Designazione, misure,
                Quantità), più il foglio «Elenco prezzi».

Il .dcf nativo non si scrive: il formato non è documentato da ACCA (lo
leggiamo solo, vedi mcp/prezzario/primus_dcf.py) e un contenitore
scritto a tentoni rischierebbe di aprirsi corrotto. L'XPWE è il formato
che ACCA pubblica per l'interscambio e PriMus lo importa direttamente.

Cosa legge del definitivo (skill deliverable-computo-metrico):
  «## Criterio X — …» / «### X.n — …»   → Super categoria / Categoria
  tabelle con colonne riconosciute per intestazione: N., Tariffa,
    Descrizione…, U.M., Quantità, Rif. progetto, (estimativo) Prezzo
  «## Elenco delle tariffe»               → descrizione di riferimento e
    fonte di ogni tariffa (prezzario regionale o nuovo prezzo)

Non estimativo (--non-estimativo): nessun prezzo, in nessun file, anche
se una colonna di prezzi fosse rimasta nel testo. Le quantità non
numeriche (TBD) diventano 0 e finiscono nel foglio «Da verificare».

Uso: computo_primus.py <3_definitivo.md> <base_uscita> [--titolo T]
       [--gara G] [--non-estimativo]
Stampa il JSON {"xpwe", "xlsx", "voci", "avvisi"}.
"""
import argparse
import json
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

RE_CRITERIO = re.compile(r"^##\s+(?:Criterio\s+)?([A-Z]|\d+)\s*[—–-]\s*(.+?)\s*$")
RE_SUB = re.compile(r"^###\s+([A-Z]?\d*(?:\.\d+)+|[A-Z]\.\d+)\s*[—–-]\s*(.+?)\s*$")
RE_NUMERO = re.compile(r"^\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)")
TITOLO_ELENCO = re.compile(r"^##\s+Elenco\s+(?:delle\s+tariffe|dei\s+prezzi|dei\s+nuovi\s+prezzi)", re.I)


# ── Lettura del definitivo ──────────────────────────────────────────
def _celle(riga: str) -> list[str]:
    return [c.strip() for c in riga.strip().strip("|").split("|")]


def _pulisci(testo: str) -> str:
    testo = re.sub(r"<br\s*/?>", "\n", testo)
    testo = re.sub(r"\*\*|__|`", "", testo)
    return re.sub(r"[ \t]+", " ", testo).strip()


def _numero(testo: str) -> float | None:
    m = RE_NUMERO.match(testo.replace(" ", " "))
    if not m:
        return None
    s = m.group(1)
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        s = s.replace(".", "")
    return float(s)


def _colonna(intest: list[str], *chiavi: str, esclusa: str | None = None) -> int | None:
    for i, h in enumerate(intest):
        hl = h.lower()
        if esclusa and esclusa in hl:
            continue
        if any(hl.startswith(k) or k in hl for k in chiavi):
            return i
    return None


def _tabelle(righe: list[str]):
    """(indice di inizio, intestazione, righe di dati) di ogni tabella markdown."""
    i = 0
    while i < len(righe):
        if righe[i].lstrip().startswith("|") and i + 1 < len(righe) and re.match(r"^\s*\|?\s*:?-{3,}", righe[i + 1]):
            intest = _celle(righe[i])
            dati, j = [], i + 2
            while j < len(righe) and righe[j].lstrip().startswith("|"):
                dati.append(_celle(righe[j]))
                j += 1
            yield i, intest, dati
            i = j
        else:
            i += 1


def leggi(md: str, non_estimativo: bool) -> tuple[list[dict], dict, list[str]]:
    righe = md.splitlines()
    avvisi: list[str] = []
    # Titoli per riga: criterio e sub-criterio correnti
    contesto, crit, sub, in_elenco = [], ("", ""), ("", ""), False
    for r in righe:
        if (m := RE_CRITERIO.match(r)):
            crit, sub, in_elenco = (m.group(1), _pulisci(m.group(2))), ("", ""), False
        elif TITOLO_ELENCO.match(r):
            in_elenco = True
        elif r.startswith("## "):
            in_elenco = False
        elif (m := RE_SUB.match(r)):
            sub = (m.group(1), _pulisci(m.group(2)))
        contesto.append((crit, sub, in_elenco))

    voci, tariffe = [], {}
    for inizio, intest, dati in _tabelle(righe):
        c_tar = _colonna(intest, "tariffa", "codice")
        c_des = _colonna(intest, "descrizione")
        c_um = _colonna(intest, "u.m", "unità di misura")
        c_qta = _colonna(intest, "quantit")
        crit, sub, in_elenco = contesto[inizio]
        if in_elenco:
            c_fonte = _colonna(intest, "fonte")
            for d in dati:
                if c_tar is None or c_tar >= len(d) or not d[c_tar].strip():
                    continue
                tariffe[_pulisci(d[c_tar])] = {
                    "descrizione": _pulisci(d[c_des]) if c_des is not None and c_des < len(d) else "",
                    "um": _pulisci(d[c_um]) if c_um is not None and c_um < len(d) else "",
                    "fonte": _pulisci(d[c_fonte]) if c_fonte is not None and c_fonte < len(d) else "",
                }
            continue
        if c_des is None or c_qta is None or c_um is None:
            continue  # riepiloghi e altre tabelle: non sono voci di computo
        c_num = _colonna(intest, "n.", "n ", "num")
        c_rif = _colonna(intest, "rif.", "riferimento")  # non «rif»: è dentro «Tariffa»
        c_sost = _colonna(intest, "voce di progetto", esclusa="rif")
        c_prezzo = None if non_estimativo else _colonna(intest, "prezzo unitario", "prezzo")
        for d in dati:
            d = d + [""] * (len(intest) - len(d))
            descr = _pulisci(d[c_des])
            if not descr or descr.lower().startswith("totale"):
                continue
            qta_testo = _pulisci(d[c_qta])
            qta = _numero(qta_testo)
            tariffa = _pulisci(d[c_tar]) if c_tar is not None else ""
            n = _pulisci(d[c_num]) if c_num is not None else str(len(voci) + 1)
            if qta is None:
                avvisi.append(f"Voce {n}: quantità «{qta_testo or 'vuota'}» non numerica, importata come 0.")
            if not tariffa or tariffa in ("—", "-", "TBD"):
                avvisi.append(f"Voce {n}: tariffa mancante.")
                tariffa = ""
            voci.append({
                "n": n, "tariffa": tariffa, "descrizione": descr, "um": _pulisci(d[c_um]),
                "quantita": qta or 0.0, "quantita_testo": qta_testo,
                "rif": _pulisci(d[c_rif]) if c_rif is not None else "",
                "sostituita": _pulisci(d[c_sost]) if c_sost is not None else "",
                "prezzo": _numero(d[c_prezzo]) if c_prezzo is not None else None,
                "criterio": crit, "sub": sub,
            })
    for v in voci:
        if v["tariffa"] and tariffe and v["tariffa"] not in tariffe:
            avvisi.append(f"Voce {v['n']}: tariffa {v['tariffa']} assente dall'«Elenco delle tariffe».")
    return voci, tariffe, avvisi


# ── Struttura: categorie ed elenco prezzi ───────────────────────────
def struttura(voci: list[dict], tariffe: dict):
    supercat, cat = {}, {}
    for v in voci:
        k_sc = v["criterio"][0] or "—"
        if k_sc not in supercat:
            supercat[k_sc] = {"id": len(supercat) + 1,
                              "nome": f"Criterio {v['criterio'][0]} — {v['criterio'][1]}" if v["criterio"][0] else "Voci"}
        k_c = v["sub"][0] or k_sc
        if k_c not in cat:
            cat[k_c] = {"id": len(cat) + 1, "nome": f"{v['sub'][0]} — {v['sub'][1]}" if v["sub"][0] else supercat[k_sc]["nome"]}
        v["id_supercat"], v["id_cat"] = supercat[k_sc]["id"], cat[k_c]["id"]

    # Una voce di elenco prezzi per tariffa e descrizione: la stessa tariffa
    # con lavorazioni offerte diverse diventa «tariffa (2)», «(3)», come le
    # varianti dello stesso codice nei prezzari regionali in PriMus.
    elenco, per_chiave, usate = [], {}, {}
    for v in voci:
        chiave = (v["tariffa"], v["descrizione"], v["um"], v["prezzo"])
        if chiave not in per_chiave:
            base = v["tariffa"] or f"VOCE.{v['n']}"
            usate[base] = usate.get(base, 0) + 1
            codice = base if usate[base] == 1 else f"{base} ({usate[base]})"
            rif = tariffe.get(v["tariffa"], {})
            elenco.append({"id": len(elenco) + 1, "tariffa": codice, "rif_tariffa": v["tariffa"],
                           "descrizione": v["descrizione"], "um": v["um"], "prezzo": v["prezzo"],
                           "rif_descrizione": rif.get("descrizione", ""), "fonte": rif.get("fonte", "")})
            per_chiave[chiave] = elenco[-1]
        v["ep"] = per_chiave[chiave]
    return list(supercat.values()), list(cat.values()), elenco


# ── XPWE ────────────────────────────────────────────────────────────
def _x(tag: str, valore="") -> str:
    return f"<{tag}>{escape(str(valore))}</{tag}>"


def _num(v: float | None, dec: int = 2) -> str:
    return f"{(v or 0):.{dec}f}"


def xpwe(titolo: str, gara: str, supercat, cat, elenco, voci) -> str:
    oggi = date.today().strftime("%d/%m/%Y")
    out = ['<?xml version="1.0" encoding="UTF-8"?>', "<PweDocumento>",
           _x("CopyRight", "Copyright ACCA software S.p.A."), _x("TipoDocumento", 1), _x("TipoFormato", "XMLPwe"),
           _x("Versione", ""), _x("SourceVersione", ""), _x("SourceNome", "SPADA"), _x("FileNameDocumento", ""),
           "<PweDatiGenerali>", "<PweDGProgetto>", "<PweDGDatiGenerali>",
           _x("PercPrezzi", "0"), _x("Comune", ""), _x("Provincia", ""), _x("Oggetto", gara or titolo),
           _x("Committente", ""), _x("Impresa", ""), _x("ParteOpera", titolo),
           "</PweDGDatiGenerali>", "</PweDGProgetto>", "<PweDGCapitoliCategorie>",
           "<PweDGSuperCapitoli></PweDGSuperCapitoli>", "<PweDGCapitoli></PweDGCapitoli>",
           "<PweDGSubCapitoli></PweDGSubCapitoli>", "<PweDGSuperCategorie>"]
    for s in supercat:
        out.append(f'<DGSuperCategorieItem ID="{s["id"]}">' + _x("DesSintetica", s["nome"][:250]) + _x("DesEstesa", s["nome"])
                   + _x("Percentuale", "0") + _x("Codice", "") + "</DGSuperCategorieItem>")
    out += ["</PweDGSuperCategorie>", "<PweDGCategorie>"]
    for c in cat:
        out.append(f'<DGCategorieItem ID="{c["id"]}">' + _x("DesSintetica", c["nome"][:250]) + _x("DesEstesa", c["nome"])
                   + _x("Percentuale", "0") + _x("Codice", "") + "</DGCategorieItem>")
    out += ["</PweDGCategorie>", "<PweDGSubCategorie></PweDGSubCategorie>", "</PweDGCapitoliCategorie>",
            "</PweDatiGenerali>", "<PweMisurazioni>", "<PweElencoPrezzi>"]
    for e in elenco:
        ridotta = e["descrizione"] if len(e["descrizione"]) <= 120 else e["descrizione"][:117].rsplit(" ", 1)[0] + "…"
        estesa = e["descrizione"]
        if e["rif_descrizione"] and e["rif_descrizione"] not in estesa:
            estesa += f"\nVoce di riferimento ({e['fonte'] or 'prezzario'}): {e['rif_descrizione']}"
        out.append(f'<EPItem ID="{e["id"]}">' + _x("TipoEP", 0) + _x("Tariffa", e["tariffa"]) + _x("Articolo", "")
                   + _x("DesRidotta", ridotta) + _x("DesEstesa", estesa) + _x("DesBreve", ridotta[:60])
                   + _x("UnMisura", e["um"]) + _x("Prezzo1", _num(e["prezzo"]))
                   + "".join(_x(f"Prezzo{k}", "0.00") for k in range(2, 6))
                   + _x("IDSpCap", 0) + _x("IDCap", 0) + _x("IDSbCap", 0) + _x("Flags", 0) + _x("Data", oggi)
                   + _x("AdrInternet", "") + "<PweEPAnalisi></PweEPAnalisi>"
                   + _x("IncSIC", "0") + _x("IncMDO", "0") + _x("IncMAT", "0") + _x("IncATTR", "0") + "</EPItem>")
    out += ["</PweElencoPrezzi>", "<PweVociComputo>"]
    for k, v in enumerate(voci, 1):
        nota = v["rif"] or (f"In sostituzione della voce di progetto {v['sostituita']}" if v["sostituita"] else "")
        if not nota or v["quantita_testo"] and _numero(v["quantita_testo"]) is None:
            nota = (nota + " — " if nota else "") + f"Quantità: {v['quantita_testo'] or 'da definire'}"
        out.append(f'<VCItem ID="{k}">' + _x("IDEP", v["ep"]["id"]) + _x("Quantita", _num(v["quantita"], 3))
                   + _x("DataMis", oggi) + _x("Flags", 0) + _x("IDSpCat", v["id_supercat"]) + _x("IDCat", v["id_cat"])
                   + _x("IDSbCat", 0) + "<PweVCMisure>"
                   + '<RGItem ID="1">' + _x("IDVV", 0) + _x("Descrizione", nota) + _x("PartiUguali", "")
                   + _x("Lunghezza", "") + _x("Larghezza", "") + _x("HPeso", "") + _x("Quantita", _num(v["quantita"], 3))
                   + _x("Flags", 0) + "</RGItem></PweVCMisure></VCItem>")
    out += ["</PweVociComputo>", "</PweMisurazioni>", "</PweDocumento>"]
    return "\n".join(out) + "\n"


# ── XLSX minimale (nessuna dipendenza) ──────────────────────────────
def _col(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _foglio(righe: list[list], larghezze: list[int]) -> str:
    cols = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(larghezze))
    xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
           '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
           f"<cols>{cols}</cols><sheetData>"]
    for r, riga in enumerate(righe, 1):
        celle = []
        for c, v in enumerate(riga):
            ref, stile = f"{_col(c)}{r}", ' s="1"' if r == 1 else ' s="2"'
            if v is None or v == "":
                continue
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                celle.append(f'<c r="{ref}"{stile if r == 1 else ""}><v>{v}</v></c>')
            else:
                testo = escape(str(v)).replace("\n", "&#10;")
                celle.append(f'<c r="{ref}" t="inlineStr"{stile}><is><t xml:space="preserve">{testo}</t></is></c>')
        xml.append(f'<row r="{r}">{"".join(celle)}</row>')
    xml.append("</sheetData></worksheet>")
    return "".join(xml)


def xlsx(percorso: Path, fogli: list[tuple[str, list[list], list[int]]]):
    ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
          '<Default Extension="xml" ContentType="application/xml"/>',
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>']
    ct += [f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
           for i in range(1, len(fogli) + 1)]
    ct.append("</Types>")
    wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
          + "".join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _, _) in enumerate(fogli, 1))
          + "</sheets></workbook>")
    wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                         for i in range(1, len(fogli) + 1))
               + f'<Relationship Id="rId{len(fogli) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
               + "</Relationships>")
    stili = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             '<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>'
             '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
             '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
             '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
             '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
             '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
             '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>'
             '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    with zipfile.ZipFile(percorso, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "".join(ct))
        z.writestr("_rels/.rels", rels)
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/styles.xml", stili)
        for i, (_, righe, larg) in enumerate(fogli, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", _foglio(righe, larg))


def fogli_excel(voci, elenco, avvisi, non_estimativo: bool):
    intest = ["N.ord", "Tariffa", "Designazione dei lavori", "Par.ug.", "Lung.", "Larg.", "H/peso", "Quantità", "U.M."]
    if not non_estimativo:
        intest += ["Prezzo unitario", "Importo"]
    intest += ["Super categoria", "Categoria", "Riferimento di progetto"]
    computo = [intest]
    for k, v in enumerate(voci, 1):
        riga = [k, v["ep"]["tariffa"], v["descrizione"], "", "", "", "", v["quantita"], v["um"]]
        if not non_estimativo:
            riga += [v["prezzo"] if v["prezzo"] is not None else "",
                     round(v["prezzo"] * v["quantita"], 2) if v["prezzo"] is not None else ""]
        riga += [f"{v['criterio'][0]} — {v['criterio'][1]}" if v["criterio"][0] else "",
                 f"{v['sub'][0]} — {v['sub'][1]}" if v["sub"][0] else "", v["rif"]]
        computo.append(riga)
    larg = [7, 22, 70, 7, 8, 8, 8, 10, 7] + ([12, 12] if not non_estimativo else []) + [30, 30, 40]

    ep = [["Tariffa", "Descrizione estesa", "U.M."] + ([] if non_estimativo else ["Prezzo"])
          + ["Fonte", "Voce di riferimento"]]
    for e in elenco:
        ep.append([e["tariffa"], e["descrizione"], e["um"]] + ([] if non_estimativo else [e["prezzo"] if e["prezzo"] is not None else ""])
                  + [e["fonte"], e["rif_descrizione"]])
    larg_ep = [22, 80, 7] + ([] if non_estimativo else [12]) + [28, 60]
    fogli = [("Computo", computo, larg), ("Elenco prezzi", ep, larg_ep)]
    if avvisi:
        fogli.append(("Da verificare", [["Avviso"]] + [[a] for a in avvisi], [110]))
    return fogli


def converti(sorgente: Path, base: Path, titolo: str, gara: str, non_estimativo: bool) -> dict:
    voci, tariffe, avvisi = leggi(sorgente.read_text(encoding="utf-8"), non_estimativo)
    if not voci:
        raise ValueError("Nessuna voce di computo riconosciuta nel definitivo (servono tabelle con Descrizione, U.M. e Quantità).")
    supercat, cat, elenco = struttura(voci, tariffe)
    f_xpwe, f_xlsx = base.with_suffix(".xpwe"), base.with_suffix(".xlsx")
    f_xpwe.write_text(xpwe(titolo, gara, supercat, cat, elenco, voci), encoding="utf-8")
    xlsx(f_xlsx, fogli_excel(voci, elenco, avvisi, non_estimativo))
    return {"xpwe": str(f_xpwe), "xlsx": str(f_xlsx), "voci": len(voci), "avvisi": avvisi}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("sorgente", type=Path)
    ap.add_argument("base", type=Path, help="percorso di uscita senza estensione")
    ap.add_argument("--titolo", default="Computo metrico")
    ap.add_argument("--gara", default="")
    ap.add_argument("--non-estimativo", action="store_true")
    a = ap.parse_args()
    try:
        r = converti(a.sorgente, a.base, a.titolo, a.gara, a.non_estimativo)
    except (OSError, ValueError) as e:
        print(str(e), file=sys.stderr)
        return 1
    print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
