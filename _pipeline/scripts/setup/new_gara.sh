#!/bin/bash
# new_gara.sh — crea SOLO la struttura dati di una nuova gara.
#
# Sostituisce integralmente lo script omonimo del modello a template
# clonato (che clonava l'intero repo SPADA per gara): qui non viene
# copiato alcun file di codice. Agenti, skill, comandi, script e hook
# restano nella pipeline condivisa e si risolvono da li' (vedi
# link_pipeline.sh e docs/sprint1-inventario.md).
#
# Uso:
#   ./new_gara.sh --slug 2026-comune-bari-scuola \
#                  --nome "Lavori di efficientamento energetico scuola X" \
#                  --regione Puglia --anno-prezzario 2026 \
#                  --modello claude-sonnet-5 --effort medium
#
# Variabili di ambiente (opzionali):
#   SPADA_GARE_DIR — cartella dove risiedono le gare (default: ~/spada/gare)

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

SLUG=""; NOME=""; REGIONE=""; ANNO=""; MODELLO=""; EFFORT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --nome) NOME="$2"; shift 2 ;;
    --regione) REGIONE="$2"; shift 2 ;;
    --anno-prezzario) ANNO="$2"; shift 2 ;;
    --modello) MODELLO="$2"; shift 2 ;;
    --effort) EFFORT="$2"; shift 2 ;;
    *) error "Argomento sconosciuto: $1" ;;
  esac
done

[ -n "$SLUG" ]    || error "--slug obbligatorio (es. 2026-comune-bari-scuola)"
[ -n "$NOME" ]    || error "--nome obbligatorio (nome esteso della gara)"
[ -n "$REGIONE" ] || error "--regione obbligatoria (per il prezzario)"
[ -n "$ANNO" ]    || error "--anno-prezzario obbligatorio"
MODELLO="${MODELLO:-claude-sonnet-5}"
EFFORT="${EFFORT:-medium}"

case "$SLUG" in
  *[!a-z0-9-]*|"") error "--slug deve contenere solo minuscole, cifre e trattini: '$SLUG' non valido." ;;
esac

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
GARA_PATH="$GARE_DIR/$SLUG"

[ ! -d "$GARA_PATH" ] || error "La cartella $GARA_PATH esiste già. Scegli un altro --slug."

info "Creo gara: $SLUG"
info "Percorso:  $GARA_PATH"

mkdir -p "$GARA_PATH"/{input/disciplinare,input/elaborati,input/p7m,02_graph,_state/handoff}
mkdir -p "$GARA_PATH"/output/{03_criteria/criteria,04_doc_summaries,05_criteria_outputs,06_registers,07_questions,10_offer,11_view}

touch "$GARA_PATH"/input/disciplinare/.gitkeep \
      "$GARA_PATH"/input/elaborati/.gitkeep \
      "$GARA_PATH"/input/p7m/.gitkeep

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$GARA_PATH/manifest.json" <<JSON
{
  "\$schema": "../../_pipeline/schemas/manifest.schema.json",
  "slug": "$SLUG",
  "nome": "$NOME",
  "creato_il": "$NOW_ISO",
  "prezzario": {
    "regione": "$REGIONE",
    "anno": $ANNO
  },
  "esecuzione": {
    "modello": "$MODELLO",
    "effort": "$EFFORT"
  },
  "gara": {
    "stazione_appaltante": "",
    "CIG": "",
    "CUP": "",
    "importo_base_asta": "",
    "scadenza_offerta": ""
  }
}
JSON

cat > "$GARA_PATH/_state/fasi.json" <<JSON
{
  "\$schema": "../../_pipeline/schemas/fasi.schema.json",
  "fase_corrente": 1,
  "fasi": {
    "1_acquisizione_documenti":       { "stato": "da_eseguire", "sintesi": "" },
    "2_costruzione_grafo":            { "stato": "da_eseguire", "sintesi": "" },
    "3_analisi_strategica":           { "stato": "da_eseguire", "sintesi": "" },
    "4_elaborazione_criteri":         { "stato": "da_eseguire", "sintesi": "" },
    "5_revisione_proposte":           { "stato": "da_eseguire", "sintesi": "" },
    "6_stesura_offerta":              { "stato": "da_eseguire", "sintesi": "" },
    "7_approvazione_finale":          { "stato": "da_eseguire", "sintesi": "" }
  }
}
JSON

cat > "$GARA_PATH/_state/attivita.json" <<JSON
{ "agenti_attivi": [], "aggiornato_il": "$NOW_ISO" }
JSON

cat > "$GARA_PATH/_state/memoria.md" <<MD
# Memoria di gara — $NOME

Digest cumulativo in linguaggio naturale. Ogni fase lo legge come
contesto iniziale e lo aggiorna a fine esecuzione (vedi Sprint 3).

Gara creata il $NOW_ISO. Nessuna fase eseguita ancora.
MD

cat > "$GARA_PATH/_state/run_log.json" <<JSON
{ "\$schema": "../../_pipeline/schemas/run_log.schema.json", "runs": [] }
JSON

git -C "$GARA_PATH" init -q -b main
git -C "$GARA_PATH" add -A
git -C "$GARA_PATH" commit -q -m "init: crea struttura dati gara $SLUG"

echo ""
info "Gara creata con successo."
echo ""
echo "  Nessun file di codice è stato copiato: agenti, skill, comandi e"
echo "  script si risolvono dalla pipeline condivisa (vedi link_pipeline.sh)."
echo ""
echo "  Prossimi passi:"
echo "  1. Carica il disciplinare in: $GARA_PATH/input/disciplinare/"
echo "  2. Carica gli elaborati in:   $GARA_PATH/input/elaborati/"
echo "  3. Esegui la Fase 1:          spada-fase $SLUG 1"
