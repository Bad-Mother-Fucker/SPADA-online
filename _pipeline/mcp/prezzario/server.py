#!/usr/bin/env python3
"""Server MCP `prezzario` — interrogazione del database prezzari (Sprint 2).

Sostituisce la skill `prezzario` a indice JSON di _riferimento/: gli
agenti (strategy-auditor, criterion-agent) interrogano questi tool
invece di caricare un file JSON intero in contesto. Nessun tool qui
restituisce mai un indice completo — solo righe puntuali.

Tool esposti:
  cerca_voce(testo, regione, anno, limite=10)
  dettaglio_analisi(codice_tariffa, regione, anno)
  confronta_prezzo(descrizione_lavorazione, prezzo_offerto, regione, anno, codice_tariffa=None)
  versione_prezzario(regione, anno)

Configurazione: SPADA_DB_PATH (default: <_pipeline>/../_data/spada.db,
risolto rispetto alla posizione di questo file, coerente con la
struttura target del piano: _data/ vive fuori da _pipeline/ e non e'
versionato).
"""
import os
import sqlite3
from pathlib import Path

from mcp.server.fastmcp import FastMCP

DEFAULT_DB = Path(__file__).resolve().parents[3] / "_data" / "spada.db"
DB_PATH = Path(os.environ.get("SPADA_DB_PATH", DEFAULT_DB))

mcp = FastMCP("prezzario")


def _connect():
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"spada.db non trovato in {DB_PATH}. Importa almeno un'edizione con "
            "import_prezzario.py prima di interrogare il server MCP."
        )
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con


# Soglie di scostamento per confronta_prezzo — allineate al price-gap
# check di strategy-auditor in _riferimento/ (BASSO/MEDIO/ALTO).
SOGLIA_BASSO = 0.05   # entro 5%: in linea col prezzario
SOGLIA_MEDIO = 0.15   # 5-15%: scostamento da segnalare
# oltre 15%: ALTO


@mcp.tool()
def cerca_voce(testo: str, regione: str, anno: int, limite: int = 10) -> dict:
    """Cerca voci di prezzario per parola chiave (full-text su voce+articolo).

    Non restituisce mai l'indice completo: solo le prime `limite` righe
    più rilevanti. Se una regione/anno non è stata importata, lo dice
    esplicitamente invece di restituire un risultato vuoto ambiguo.
    """
    con = _connect()
    try:
        cur = con.execute(
            "SELECT regione, anno FROM prezzario_versioni WHERE regione = ? AND anno = ?",
            (regione, anno),
        )
        if cur.fetchone() is None:
            return {
                "disponibile": False,
                "messaggio": f"Prezzario {regione} {anno} non importato in spada.db. "
                             "Non e' possibile confrontare prezzi per questa gara finche' non viene importato.",
                "risultati": [],
            }

        rows = con.execute(
            """
            SELECT a.codice_completo, a.voce, a.articolo, a.unita_misura, a.prezzo
            FROM prezzario_articoli_fts f
            JOIN prezzario_articoli a
              ON a.regione = f.regione AND a.anno = f.anno AND a.codice_completo = f.codice_completo
            WHERE f.regione = ? AND f.anno = ? AND prezzario_articoli_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (regione, anno, testo, limite),
        ).fetchall()
        return {
            "disponibile": True,
            "risultati": [
                {
                    "codice_completo": r["codice_completo"],
                    "voce": r["voce"],
                    "articolo": r["articolo"],
                    "unita_misura": r["unita_misura"],
                    "prezzo": r["prezzo"],
                }
                for r in rows
            ],
        }
    finally:
        con.close()


@mcp.tool()
def dettaglio_analisi(codice_tariffa: str, regione: str, anno: int) -> dict:
    """Scomposizione (materiali/manodopera/attrezzature) di una voce.

    `componenti` è restituita come lista ordinata, non aggregata per
    categoria: la stessa categoria può comparire più volte come
    sotto-gruppi di fasi distinte della stessa voce composita — vedi
    import_prezzario.py. Aggregare qui sommerebbe fasi diverse.
    """
    con = _connect()
    try:
        articolo = con.execute(
            "SELECT * FROM prezzario_articoli WHERE regione=? AND anno=? AND codice_completo=?",
            (regione, anno, codice_tariffa),
        ).fetchone()
        if articolo is None:
            return {"trovato": False, "messaggio": f"Codice {codice_tariffa} non presente in {regione} {anno}."}

        componenti_rows = con.execute(
            """SELECT id, ordine, categoria, totale, totale_calcolato
               FROM prezzario_analisi_componenti
               WHERE regione=? AND anno=? AND codice_completo=?
               ORDER BY ordine""",
            (regione, anno, codice_tariffa),
        ).fetchall()

        if not componenti_rows:
            return {
                "trovato": True,
                "voce_elementare": True,
                "messaggio": "Voce elementare (es. MATERIALI o MANO D'OPERA): nessuna scomposizione, "
                             "e' essa stessa componente atomica.",
                "prezzo": articolo["prezzo"],
                "unita_misura": articolo["unita_misura"],
            }

        componenti = []
        for c in componenti_rows:
            voci = con.execute(
                """SELECT ordine, codice, descrizione, codice_collegato, unita_misura,
                          quantita, prezzo_unitario, scostamento_pct, importo
                   FROM prezzario_analisi_voci WHERE componente_id = ? ORDER BY ordine""",
                (c["id"],),
            ).fetchall()
            componenti.append({
                "categoria": c["categoria"],
                "totale": c["totale"],
                "voci": [dict(v) for v in voci],
            })

        return {
            "trovato": True,
            "voce_elementare": False,
            "codice_completo": codice_tariffa,
            "voce": articolo["voce"],
            "prezzo": articolo["prezzo"],
            "unita_misura": articolo["unita_misura"],
            "componenti": componenti,
        }
    finally:
        con.close()


@mcp.tool()
def confronta_prezzo(prezzo_offerto: float, regione: str, anno: int,
                      codice_tariffa: str | None = None,
                      descrizione_lavorazione: str | None = None) -> dict:
    """Confronta un prezzo offerto/di progetto con il prezzario regionale.

    Preferire `codice_tariffa` (lookup esatto). Se non noto, `descrizione_lavorazione`
    fa una ricerca testuale e confronta con il primo risultato, segnalando
    che il match è approssimativo. Se non c'è alcun match, ritorna
    categoria "non_confrontabile" — mai una classificazione forzata su un
    codice diverso.
    """
    con = _connect()
    try:
        if con.execute(
            "SELECT 1 FROM prezzario_versioni WHERE regione=? AND anno=?", (regione, anno)
        ).fetchone() is None:
            return {"comparabile": False, "messaggio": f"Prezzario {regione} {anno} non importato."}

        riga = None
        match_approssimativo = False
        if codice_tariffa:
            riga = con.execute(
                "SELECT codice_completo, voce, prezzo, unita_misura FROM prezzario_articoli "
                "WHERE regione=? AND anno=? AND codice_completo=?",
                (regione, anno, codice_tariffa),
            ).fetchone()
        if riga is None and descrizione_lavorazione:
            riga = con.execute(
                """SELECT a.codice_completo, a.voce, a.prezzo, a.unita_misura
                   FROM prezzario_articoli_fts f
                   JOIN prezzario_articoli a
                     ON a.regione=f.regione AND a.anno=f.anno AND a.codice_completo=f.codice_completo
                   WHERE f.regione=? AND f.anno=? AND prezzario_articoli_fts MATCH ?
                   ORDER BY rank LIMIT 1""",
                (regione, anno, descrizione_lavorazione),
            ).fetchone()
            match_approssimativo = riga is not None

        if riga is None or riga["prezzo"] is None:
            return {
                "comparabile": False,
                "messaggio": "Nessuna voce corrispondente nel prezzario regionale (o prezzo nullo per contratto, "
                             "es. voce MATERIALI): confronto non forzabile, segnalare come 'non confrontabile'.",
            }

        prezzo_rif = riga["prezzo"]
        scostamento = (prezzo_offerto - prezzo_rif) / prezzo_rif if prezzo_rif else None
        scostamento_abs = abs(scostamento) if scostamento is not None else None
        if scostamento_abs is None:
            categoria = "non_confrontabile"
        elif scostamento_abs <= SOGLIA_BASSO:
            categoria = "BASSO"
        elif scostamento_abs <= SOGLIA_MEDIO:
            categoria = "MEDIO"
        else:
            categoria = "ALTO"

        return {
            "comparabile": True,
            "match_approssimativo": match_approssimativo,
            "codice_completo": riga["codice_completo"],
            "voce_prezzario": riga["voce"],
            "prezzo_prezzario": prezzo_rif,
            "prezzo_offerto": prezzo_offerto,
            "scostamento_pct": round(scostamento * 100, 2) if scostamento is not None else None,
            "categoria": categoria,
        }
    finally:
        con.close()


@mcp.tool()
def versione_prezzario(regione: str, anno: int) -> dict:
    """Identificativo dell'edizione importata, per registrarlo in run_log.json."""
    con = _connect()
    try:
        riga = con.execute(
            """SELECT regione, anno, fonte, riferimento_normativo, vigenza,
                      totale_voci_articoli, totale_voci_analisi, importato_il, hash_sorgente
               FROM prezzario_versioni WHERE regione=? AND anno=?""",
            (regione, anno),
        ).fetchone()
        if riga is None:
            return {"disponibile": False}
        d = dict(riga)
        d["disponibile"] = True
        d["identificativo"] = f"{riga['regione']}-{riga['anno']}-{riga['hash_sorgente']}"
        return d
    finally:
        con.close()


if __name__ == "__main__":
    mcp.run()
