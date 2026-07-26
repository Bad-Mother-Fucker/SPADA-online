#!/usr/bin/env python3
"""import_prezzario.py — importa un'edizione regionale del prezzario
(i due JSON prodotti da prometeus-prezzari) in spada.db (SQLite+FTS5).

Sostituisce il modello a indice JSON caricato in contesto: da qui in
poi il prezzario si interroga (server MCP, Sprint 2.5), non si carica.

Validazione bloccante (Sprint 2.3): per ogni voce del file Analisi, la
somma degli `importo` dei componenti elementari di ciascun sotto-gruppo
deve combaciare con il `totale` dichiarato per quel sotto-gruppo. I
raggruppamenti di categoria (es. "MT") possono ripetersi piu' volte
nella stessa voce come fasi distinte: un parser a dizionario che
aggrega per categoria sommerebbe fasi diverse sotto un totale sbagliato
in modo silenzioso. Qui `componenti` resta una lista ordinata (colonna
`ordine`) e ogni sotto-gruppo e' validato indipendentemente, PRIMA di
scrivere in tabella — un dato scritto e poi scoperto corrotto non è
piu' visibile a un agente che lo interroga.

Uso:
  python3 import_prezzario.py \
    --db /path/spada.db \
    --regione Campania --anno 2026 \
    --articoli prezzario_campania_2026.json \
    --analisi prezzario_campania_analisi_2026.json

Uscita non-zero e nessuna scrittura commitata se la validazione fallisce.
"""
import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

TOLLERANZA_ASSOLUTA = 0.02   # euro — arrotondamenti di importazione Excel→JSON
TOLLERANZA_RELATIVA = 0.001  # 0.1% del totale dichiarato, per importi grandi


def _match(totale_dichiarato, totale_calcolato):
    if totale_dichiarato is None:
        return True  # nessun dichiarato da confrontare: non e' un'anomalia di questo importer
    delta = abs(totale_calcolato - totale_dichiarato)
    soglia = max(TOLLERANZA_ASSOLUTA, abs(totale_dichiarato) * TOLLERANZA_RELATIVA)
    return delta <= soglia


def valida_e_prepara_analisi(analisi_json, regione, anno):
    """Ricalcola ogni subtotale dichiarato e blocca al primo mismatch.

    Ritorna la lista di righe pronte per l'inserimento; solleva
    ValueError con dettaglio del primo mismatch trovato.
    """
    righe_componenti = []
    righe_voci_per_componente = []  # parallela a righe_componenti

    for codice, voce in analisi_json.get("analisi", {}).items():
        componenti = voce.get("componenti")
        if not isinstance(componenti, list):
            raise ValueError(
                f"{codice}: 'componenti' non e' una lista (trovato {type(componenti).__name__}). "
                "Il contratto prometeus-prezzari richiede una lista ordinata, non un dizionario: "
                "un dizionario indicizzato per categoria aggregherebbe silenziosamente fasi distinte."
            )
        for ordine, comp in enumerate(componenti):
            voci = comp.get("voci") or []
            totale_calcolato = sum(v.get("importo") or 0.0 for v in voci)
            totale_dichiarato = comp.get("totale")
            if not _match(totale_dichiarato, totale_calcolato):
                raise ValueError(
                    f"Subtotale non congruente per {codice}, sotto-gruppo #{ordine} "
                    f"(categoria={comp.get('categoria')!r}): "
                    f"dichiarato={totale_dichiarato}, somma voci={totale_calcolato:.5f}, "
                    f"scarto={abs((totale_dichiarato or 0) - totale_calcolato):.5f}. "
                    "Importazione bloccata: un subtotale scritto e poi scoperto errato non e' "
                    "piu' visibile a un agente che lo interroga via MCP."
                )
            righe_componenti.append((regione, anno, codice, ordine, comp.get("categoria"),
                                      totale_dichiarato, totale_calcolato))
            righe_voci_per_componente.append([
                (v_ordine, v.get("codice"), v.get("descrizione"), v.get("codice_collegato"),
                 v.get("unita_misura"), v.get("quantita"), v.get("prezzo_unitario"),
                 v.get("scostamento_pct"), v.get("importo"))
                for v_ordine, v in enumerate(voci)
            ])
    return righe_componenti, righe_voci_per_componente


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True)
    ap.add_argument("--regione", required=True)
    ap.add_argument("--anno", required=True, type=int)
    ap.add_argument("--articoli", required=True, type=Path)
    ap.add_argument("--analisi", required=True, type=Path)
    args = ap.parse_args()

    for p in (args.articoli, args.analisi):
        if not p.exists():
            print(f"✗ File non trovato: {p}", file=sys.stderr)
            sys.exit(1)

    print(f"▶ Leggo {args.articoli}")
    articoli_json = json.loads(args.articoli.read_text(encoding="utf-8"))
    print(f"▶ Leggo {args.analisi}")
    analisi_json = json.loads(args.analisi.read_text(encoding="utf-8"))

    print("▶ Valido i subtotali dell'Analisi (bloccante)...")
    try:
        righe_componenti, righe_voci = valida_e_prepara_analisi(analisi_json, args.regione, args.anno)
    except ValueError as e:
        print(f"✗ {e}", file=sys.stderr)
        sys.exit(1)
    print(f"  OK — {len(righe_componenti)} sotto-gruppi validati, nessun mismatch.")

    hash_sorgente = sha256_file(args.articoli)[:16] + "+" + sha256_file(args.analisi)[:16]

    schema_sql = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")

    con = sqlite3.connect(args.db)
    con.execute("PRAGMA foreign_keys = ON")
    try:
        con.executescript(schema_sql)

        with con:
            con.execute("DELETE FROM prezzario_versioni WHERE regione = ? AND anno = ?",
                        (args.regione, args.anno))
            meta = articoli_json.get("metadata", {})
            con.execute(
                """INSERT INTO prezzario_versioni
                   (regione, anno, fonte, riferimento_normativo, vigenza,
                    totale_voci_articoli, totale_voci_analisi, importato_il, hash_sorgente)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (args.regione, args.anno, meta.get("fonte"), meta.get("riferimento_normativo"),
                 meta.get("vigenza"), len(articoli_json.get("voci", {})),
                 len(analisi_json.get("analisi", {})),
                 datetime.now(timezone.utc).isoformat(), hash_sorgente),
            )

            n_articoli = 0
            articolo_cols = [
                "regione", "anno", "codice_completo",
                "tipologia_famiglia", "capitolo", "voce", "articolo", "unita_misura",
                "prezzo_base", "prezzo",
                "spese_generali_pct", "spese_generali",
                "utili_impresa_pct", "utili_impresa",
                "oneri_sicurezza_impresa_pct", "oneri_sicurezza_impresa",
                "manodopera_indiretta_incidenza", "manodopera_indiretta",
                "manodopera_diretta_incidenza", "manodopera_diretta",
                "oneri_sicurezza_incidenza_su_prezzo",
            ]
            insert_sql = (
                f"INSERT INTO prezzario_articoli ({','.join(articolo_cols)}) "
                f"VALUES ({','.join('?' for _ in articolo_cols)})"
            )
            for codice, v in articoli_json.get("voci", {}).items():
                values = {
                    "regione": args.regione, "anno": args.anno, "codice_completo": codice,
                    "tipologia_famiglia": v.get("tipologia_famiglia"), "capitolo": v.get("capitolo"),
                    "voce": v.get("voce"), "articolo": v.get("articolo"), "unita_misura": v.get("unita_misura"),
                    "prezzo_base": v.get("prezzo_base"), "prezzo": v.get("prezzo"),
                    "spese_generali_pct": v.get("spese_generali_pct"), "spese_generali": v.get("spese_generali"),
                    "utili_impresa_pct": v.get("utili_impresa_pct"), "utili_impresa": v.get("utili_impresa"),
                    "oneri_sicurezza_impresa_pct": v.get("oneri_sicurezza_impresa_pct"),
                    "oneri_sicurezza_impresa": v.get("oneri_sicurezza_impresa"),
                    "manodopera_indiretta_incidenza": v.get("manodopera_indiretta_incidenza"),
                    "manodopera_indiretta": v.get("manodopera_indiretta"),
                    "manodopera_diretta_incidenza": v.get("manodopera_diretta_incidenza"),
                    "manodopera_diretta": v.get("manodopera_diretta"),
                    "oneri_sicurezza_incidenza_su_prezzo": v.get("oneri_sicurezza_incidenza_su_prezzo"),
                }
                con.execute(insert_sql, tuple(values[c] for c in articolo_cols))
                con.execute(
                    "INSERT INTO prezzario_articoli_fts (regione, anno, codice_completo, voce, articolo) VALUES (?,?,?,?,?)",
                    (args.regione, args.anno, codice, v.get("voce"), v.get("articolo")),
                )
                n_articoli += 1

            n_componenti = 0
            n_voci = 0
            for (regione, anno, codice, ordine, categoria, totale, totale_calcolato), voci in zip(righe_componenti, righe_voci):
                cur = con.execute(
                    """INSERT INTO prezzario_analisi_componenti
                       (regione, anno, codice_completo, ordine, categoria, totale, totale_calcolato)
                       VALUES (?,?,?,?,?,?,?)""",
                    (regione, anno, codice, ordine, categoria, totale, totale_calcolato),
                )
                componente_id = cur.lastrowid
                n_componenti += 1
                for v_ordine, v_codice, descr, coll, um, qta, pu, scost, importo in voci:
                    con.execute(
                        """INSERT INTO prezzario_analisi_voci
                           (componente_id, ordine, codice, descrizione, codice_collegato,
                            unita_misura, quantita, prezzo_unitario, scostamento_pct, importo)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (componente_id, v_ordine, v_codice, descr, coll, um, qta, pu, scost, importo),
                    )
                    n_voci += 1

        print(f"✓ Importati {n_articoli} articoli, {n_componenti} sotto-gruppi analisi, {n_voci} voci elementari.")
        print(f"  Versione: {args.regione} {args.anno} — hash_sorgente {hash_sorgente}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
