#!/usr/bin/env bash
# import_prezzario.sh — scarica un'edizione regionale del prezzario da
# prometeus-prezzari e la importa in spada.db.
#
# Perché esiste: i passi (gh release download → gunzip → import) erano
# documentati a mano nel README del server MCP, con il percorso del
# database da indovinare. Sbagliarlo significa importare in un .db che
# nessuno interroga — l'errore non si vede, il prezzario "non c'è" e
# basta. Qui il database è lo stesso che usano il backend e il server
# MCP, risolto con le stesse variabili d'ambiente.
#
# Uso:
#   bash import_prezzario.sh Campania 2026
#   SPADA_DB_PATH=/altro/spada.db bash import_prezzario.sh Campania 2026
#
# Richiede: gh autenticato (il repo dei prezzari è privato), python3.
# È idempotente: reimportare la stessa edizione la sostituisce, non la
# duplica.
set -euo pipefail

REGIONE="${1:-}"
ANNO="${2:-}"
if [ -z "$REGIONE" ] || [ -z "$ANNO" ]; then
  echo "uso: bash import_prezzario.sh <Regione> <anno>    (es. Campania 2026)" >&2
  exit 2
fi

REPO="${SPADA_PREZZARI_REPO:-Bad-Mother-Fucker/prometeus-prezzari}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(cd "$HERE/../.." && pwd)"

# Stessa risoluzione del backend (app/backend/paths.py) e del server MCP:
# SPADA_DB_PATH vince, poi SPADA_DATA_DIR, poi ~/spada/_data.
DATA_DIR="${SPADA_DATA_DIR:-$HOME/spada/_data}"
DB_PATH="${SPADA_DB_PATH:-$DATA_DIR/spada.db}"

# tag e nomi asset seguono la convenzione di prometeus-prezzari
REGIONE_LOWER="$(echo "$REGIONE" | tr '[:upper:]' '[:lower:]')"
TAG="${REGIONE_LOWER}-${ANNO}"
ASSET_ARTICOLI="prezzario_${REGIONE_LOWER}_${ANNO}.json.gz"
ASSET_ANALISI="prezzario_${REGIONE_LOWER}_analisi_${ANNO}.json.gz"

command -v gh >/dev/null 2>&1 || { echo "✗ gh non installato: serve per scaricare da un repo privato." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh non autenticato: esegui 'gh auth login'." >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT   # i JSON estratti pesano ~50 MB: non restano in giro

echo "▶ Scarico $TAG da $REPO"
gh release download "$TAG" --repo "$REPO" --dir "$TMP" \
  --pattern "$ASSET_ARTICOLI" --pattern "$ASSET_ANALISI" --clobber

echo "▶ Decomprimo"
gunzip -f "$TMP/$ASSET_ARTICOLI" "$TMP/$ASSET_ANALISI"

mkdir -p "$(dirname "$DB_PATH")"
echo "▶ Importo in $DB_PATH"
# L'importatore valida i subtotali dell'Analisi e non scrive nulla al
# primo mismatch: se esce non-zero, il database resta com'era.
python3 "$PIPELINE_DIR/mcp/prezzario/import_prezzario.py" \
  --db "$DB_PATH" \
  --regione "$REGIONE" --anno "$ANNO" \
  --articoli "$TMP/${ASSET_ARTICOLI%.gz}" \
  --analisi "$TMP/${ASSET_ANALISI%.gz}"

echo "▶ Verifico che il dato sia interrogabile"
python3 - "$DB_PATH" "$REGIONE" "$ANNO" <<'PY'
import sqlite3, sys
db, regione, anno = sys.argv[1], sys.argv[2], int(sys.argv[3])
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
v = con.execute(
    "SELECT * FROM prezzario_versioni WHERE regione=? AND anno=?", (regione, anno)
).fetchone()
if v is None:
    sys.exit(f"✗ nessuna riga in prezzario_versioni per {regione} {anno}")
n = con.execute(
    "SELECT COUNT(*) FROM prezzario_articoli WHERE regione=? AND anno=?", (regione, anno)
).fetchone()[0]
# Una ricerca vera: se FTS5 non fosse popolato, il conteggio sarebbe 0
# e l'errore comparirebbe solo al primo agente che interroga.
f = con.execute(
    "SELECT COUNT(*) FROM prezzario_articoli_fts WHERE prezzario_articoli_fts MATCH 'calcestruzzo'"
).fetchone()[0]
con.close()
print(f"  ✓ {regione} {anno}: {n} articoli, {v['totale_voci_analisi']} voci con analisi")
print(f"  ✓ indice full-text popolato ({f} riscontri per 'calcestruzzo')")
if n == 0 or f == 0:
    sys.exit("✗ tabelle popolate solo in parte: import da rifare")
PY

echo
echo "✓ Fatto. Ora:"
echo "    · l'elenco in 'Nuova gara' propone $REGIONE $ANNO"
echo "    · gli agenti possono usare i tool MCP: cerca_voce, dettaglio_analisi,"
echo "      confronta_prezzo, versione_prezzario"
echo "  Verifica veloce:  curl -s \$API/sistema/prezzari"
