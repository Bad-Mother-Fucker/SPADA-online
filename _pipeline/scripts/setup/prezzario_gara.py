#!/usr/bin/env python3
"""prezzario_gara.py — stato del prezzario di riferimento di una gara.

Legge regione/anno da manifest.json e cerca l'edizione in spada.db
(tabella prezzario_versioni, la stessa del server MCP). Il confronto
sulla regione ignora maiuscole/minuscole: "campania" scritto a mano alla
creazione della gara trova "Campania" importata dopo. In uscita la
regione è quella canonica del database, da usare nelle chiamate MCP.

Uso (da spada_comune.sh):
  prezzario_gara.py <manifest.json> <spada.db> json   → {"regione", "anno", "disponibile", "identificativo"}
  prezzario_gara.py <manifest.json> <spada.db> id     → identificativo come JSON, o null
  prezzario_gara.py <manifest.json> <spada.db> nota   → paragrafo per il prompt della fase

Non fallisce mai: un database o un manifest illeggibili valgono
"prezzario non disponibile", che è il caso che la pipeline sa gestire.
"""
import json
import sqlite3
import sys


def stato(manifest_path: str, db_path: str) -> dict:
    try:
        with open(manifest_path, encoding="utf-8") as f:
            prezzario = (json.load(f).get("prezzario") or {})
    except Exception:
        prezzario = {}
    regione = str(prezzario.get("regione") or "").strip()
    anno = prezzario.get("anno")
    risultato = {"regione": regione, "anno": anno, "disponibile": False, "identificativo": None}
    if not regione or not isinstance(anno, int):
        return risultato
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        riga = con.execute(
            "SELECT regione, anno, hash_sorgente FROM prezzario_versioni "
            "WHERE lower(regione) = lower(?) AND anno = ?",
            (regione, anno),
        ).fetchone()
        con.close()
    except Exception:
        riga = None
    if riga:
        risultato.update({
            "regione": riga[0], "disponibile": True,
            "identificativo": f"{riga[0]}-{riga[1]}-{riga[2]}",
        })
    return risultato


def nota(s: dict) -> str:
    regione, anno = s["regione"] or "(regione non indicata)", s["anno"] or "(anno non indicato)"
    if s["disponibile"]:
        return (
            f"Prezzario di riferimento: {regione} {anno}, disponibile nel server MCP `prezzario` "
            f"(nelle chiamate usa esattamente regione=\"{regione}\", anno={anno})."
        )
    return (
        f"Prezzario di riferimento: {regione} {anno} — NON presente in questa installazione.\n"
        "Svolgi normalmente tutto il lavoro della fase che non dipende dal prezzario, ma non fare "
        "considerazioni economiche basate su di esso: niente gap prezzi rispetto al prezzario, "
        "stima della capacità di investimento migliorativo, valorizzazione di voci a prezzario o "
        "confronti di congruità. Dove il comando, l'agente o la skill le prevedono, usa la "
        "classificazione NON DISPONIBILE con il testo previsto per il prezzario non ancora "
        f"importato, indicando che va importato (`./spada importa-prezzario {regione} {anno}`, "
        "o il pulsante «Importa ora» nel pannello della gara) e la fase rieseguita. Non sostituirlo "
        "con il prezzario di un'altra regione o di un altro anno e non stimare prezzi a occhio."
    )


def main():
    if len(sys.argv) != 4 or sys.argv[3] not in ("json", "id", "nota"):
        sys.exit("uso: prezzario_gara.py <manifest.json> <spada.db> json|id|nota")
    s = stato(sys.argv[1], sys.argv[2])
    if sys.argv[3] == "json":
        print(json.dumps(s, ensure_ascii=False))
    elif sys.argv[3] == "id":
        print(json.dumps(s["identificativo"]))
    else:
        print(nota(s))


if __name__ == "__main__":
    main()
