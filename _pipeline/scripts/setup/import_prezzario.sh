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
#   bash import_prezzario.sh Calabria 2025 ~/.spada/prezzari/Calabria/2025
#   bash import_prezzario.sh Basilicata 2025 ~/Downloads/LisBasilicata_OOPP_2025.dcf
#   SPADA_DB_PATH=/altro/spada.db bash import_prezzario.sh Campania 2026
#
# Sorgente, nell'ordine:
#   1. il terzo argomento: una cartella con i due JSON (articoli + analisi),
#      oppure un file PriMus .dcf (o una cartella che ne contiene uno);
#   2. la cache locale (~/.spada/prezzari/<Regione>/<anno>, SPADA_PREZZARI_CACHE
#      per cambiarla), se contiene i due JSON o la copia del .dcf;
#   3. la release <regione>-<anno> di prometeus-prezzari, via gh.
# Un .dcf viene prima convertito negli stessi due JSON (mcp/prezzario/primus_dcf.py),
# poi importato come gli altri; dopo l'import se ne tiene una copia nella
# cache, così './spada setup' su un database nuovo lo reimporta da solo.
#
# Richiede: python3; gh autenticato solo nel caso 3 (repo privato).
# È idempotente: reimportare la stessa edizione la sostituisce, non la
# duplica.
set -euo pipefail

REGIONE="${1:-}"
ANNO="${2:-}"
ORIGINE="${3:-}"
if [ -z "$REGIONE" ] || [ -z "$ANNO" ]; then
  echo "uso: bash import_prezzario.sh <Regione> <anno> [cartella con i JSON | file .dcf PriMus]    (es. Campania 2026)" >&2
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

FILE_ARTICOLI="${ASSET_ARTICOLI%.gz}"
FILE_ANALISI="${ASSET_ANALISI%.gz}"
CACHE="${SPADA_PREZZARI_CACHE:-$HOME/.spada/prezzari}/$REGIONE/$ANNO"
DCF_IN_CACHE="$CACHE/prezzario_${REGIONE_LOWER}_${ANNO}.dcf"

# Primo .dcf di una cartella, vuoto se non ce n'è.
dcf_in() {
  local f
  for f in "$1"/*.dcf "$1"/*.DCF; do
    [ -f "$f" ] && { printf '%s\n' "$f"; return 0; }
  done
  return 0
}

CARTELLA_LOCALE=""
DCF=""
if [ -n "$ORIGINE" ]; then
  if [ -d "$ORIGINE" ]; then
    if [ -f "$ORIGINE/$FILE_ARTICOLI" ] && [ -f "$ORIGINE/$FILE_ANALISI" ]; then
      CARTELLA_LOCALE="$ORIGINE"
    else
      DCF="$(dcf_in "$ORIGINE")"
      [ -n "$DCF" ] || { echo "✗ In $ORIGINE non ci sono né $FILE_ARTICOLI + $FILE_ANALISI né un file PriMus .dcf." >&2; exit 1; }
    fi
  elif [ -f "$ORIGINE" ]; then
    case "$ORIGINE" in
      *.dcf|*.DCF) DCF="$ORIGINE" ;;
      *) echo "✗ $ORIGINE: serve una cartella con i due JSON o un file PriMus .dcf." >&2; exit 1 ;;
    esac
  else
    echo "✗ $ORIGINE non trovato." >&2; exit 1
  fi
elif [ -f "$CACHE/$FILE_ARTICOLI" ] && [ -f "$CACHE/$FILE_ANALISI" ]; then
  CARTELLA_LOCALE="$CACHE"
elif [ -f "$DCF_IN_CACHE" ]; then
  DCF="$DCF_IN_CACHE"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT   # i JSON estratti pesano ~50 MB: non restano in giro

if [ -n "$DCF" ]; then
  # Fallisce, senza toccare il database, se il file non è un PriMus
  # leggibile o se dichiara un anno diverso da $ANNO.
  python3 "$PIPELINE_DIR/mcp/prezzario/primus_dcf.py" "$DCF" \
    --regione "$REGIONE" --anno "$ANNO" --out "$TMP"
  SORGENTE="$TMP"
elif [ -n "$CARTELLA_LOCALE" ]; then
  echo "▶ Uso i file locali in $CARTELLA_LOCALE"
  SORGENTE="$CARTELLA_LOCALE"
else
  command -v gh >/dev/null 2>&1 || { echo "✗ gh non installato: serve per scaricare da un repo privato." >&2; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "✗ gh non autenticato: esegui 'gh auth login'." >&2; exit 1; }

  echo "▶ Scarico $TAG da $REPO"
  gh release download "$TAG" --repo "$REPO" --dir "$TMP" \
    --pattern "$ASSET_ARTICOLI" --pattern "$ASSET_ANALISI" --clobber

  echo "▶ Decomprimo"
  gunzip -f "$TMP/$ASSET_ARTICOLI" "$TMP/$ASSET_ANALISI"
  SORGENTE="$TMP"
fi

mkdir -p "$(dirname "$DB_PATH")"
echo "▶ Importo in $DB_PATH"
# L'importatore valida i subtotali dell'Analisi e non scrive nulla al
# primo mismatch: se esce non-zero, il database resta com'era.
python3 "$PIPELINE_DIR/mcp/prezzario/import_prezzario.py" \
  --db "$DB_PATH" \
  --regione "$REGIONE" --anno "$ANNO" \
  --articoli "$SORGENTE/$FILE_ARTICOLI" \
  --analisi "$SORGENTE/$FILE_ANALISI"

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

if [ -n "$DCF" ] && [ "$DCF" != "$DCF_IN_CACHE" ]; then
  mkdir -p "$CACHE"
  cp "$DCF" "$DCF_IN_CACHE"
  echo "  ✓ copia del .dcf in $DCF_IN_CACHE: il setup lo reimporta da lì"
fi

echo
echo "✓ Fatto. Ora:"
echo "    · l'elenco in 'Nuova gara' propone $REGIONE $ANNO"
echo "    · gli agenti possono usare i tool MCP: cerca_voce, dettaglio_analisi,"
echo "      confronta_prezzo, versione_prezzario"
echo "  Verifica veloce:  curl -s http://localhost:8000/sistema/prezzari"
