#!/bin/bash
# fetch_prezzario.sh — scarica (se non già in cache) il prezzario regionale
# di una regione/anno da prometeus-prezzari, in una cache locale condivisa
# tra tutte le gare sulla stessa macchina.
#
# Il prezzario non e' dato di gara: la stessa edizione serve identica a
# ogni gara della stessa regione nello stesso anno. Per questo la cache
# vive FUORI da ogni clone di gara, in $SPADA_PREZZARI_CACHE (default
# ~/.spada/prezzari/), e viene popolata una sola volta.
#
# Uso:
#   ./fetch_prezzario.sh <Regione> <anno>
#   ./fetch_prezzario.sh Campania 2026
#
# Stampa su stdout, come ultima riga, il percorso della cartella locale
# con i due JSON — e' il valore da scrivere in
# PROJECT_CONFIG.json -> gara.prezzario_riferimento.percorso.
#
# Variabili di ambiente (opzionali):
#   SPADA_PREZZARI_CACHE  — cartella cache (default: ~/.spada/prezzari)
#   SPADA_PREZZARI_REPO   — repo GitHub sorgente (default: Bad-Mother-Fucker/prometeus-prezzari)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}▶${NC} $1" >&2; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1" >&2; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

REGIONE="${1:-}"
ANNO="${2:-}"

if [ -z "$REGIONE" ] || [ -z "$ANNO" ]; then
  error "Uso: $0 <Regione> <anno>  (es. $0 Campania 2026)"
fi

CACHE_ROOT="${SPADA_PREZZARI_CACHE:-$HOME/.spada/prezzari}"
REPO="${SPADA_PREZZARI_REPO:-Bad-Mother-Fucker/prometeus-prezzari}"

# Il tag della release e' <regione minuscola>-<anno> — contratto fissato
# nel README di prometeus-prezzari.
REGIONE_LOWER="$(echo "$REGIONE" | tr '[:upper:]' '[:lower:]')"
TAG="${REGIONE_LOWER}-${ANNO}"

DEST="$CACHE_ROOT/$REGIONE/$ANNO"

# File attesi dopo il fetch (nome coerente con lo schema in prometeus-prezzari)
FILE_ARTICOLI="prezzario_${REGIONE_LOWER}_${ANNO}.json"
FILE_ANALISI="prezzario_${REGIONE_LOWER}_analisi_${ANNO}.json"

if [ -f "$DEST/$FILE_ARTICOLI" ] && [ -f "$DEST/$FILE_ANALISI" ]; then
  info "Prezzario $REGIONE $ANNO già in cache: $DEST"
  echo "$DEST"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  error "gh (GitHub CLI) non trovato. Necessario per scaricare la release."
fi

info "Prezzario $REGIONE $ANNO non in cache — scarico da $REPO (tag: $TAG)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! gh release download "$TAG" --repo "$REPO" --dir "$TMP_DIR" --pattern "*.gz" 2>/tmp/prezzario_fetch_err; then
  cat /tmp/prezzario_fetch_err >&2
  error "Release '$TAG' non trovata in $REPO. Il prezzario per $REGIONE $ANNO non e' ancora stato pubblicato — vedi README di prometeus-prezzari per aggiungerlo. Non procedere con un confronto prezzi senza questo file (regola anti-fabrication)."
fi

mkdir -p "$DEST"
for gz in "$TMP_DIR"/*.gz; do
  gunzip -c "$gz" > "$DEST/$(basename "${gz%.gz}")"
done

info "Prezzario $REGIONE $ANNO scaricato in: $DEST"
echo "$DEST"
