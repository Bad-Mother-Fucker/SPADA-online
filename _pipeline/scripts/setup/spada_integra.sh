#!/bin/bash
# spada_integra.sh — integra nel contesto di una gara un'informazione
# arrivata fuori dalla sequenza delle fasi, senza rieseguire nulla.
#
#   spada_integra.sh <slug> documento <percorso sotto la gara>
#       Un elaborato (o un chiarimento) caricato dopo la Fase 2: estratto,
#       aggiunto al grafo come documento nuovo o come nuova versione,
#       riflesso nel gara brief; eventuali domande nuove finiscono nel
#       registro della Fase 4.
#
#   spada_integra.sh <slug> brief
#       Riallinea il gara brief alle sezioni del template corrente con
#       tutto ciò che le fasi già eseguite hanno prodotto, e registra le
#       domande che quelle fasi avrebbero dovuto porre (gare create prima
#       del registro unico delle domande).
#
# Il run si registra in _state/run_log.json come le fasi (fase 2, con
# il campo `oggetto`), e lo stream completo in _state/run_<id>.stream.jsonl.
# Non cambia lo stato delle fasi in fasi.json: un'informazione in più
# non invalida da sola le analisi già fatte, lo decide il professionista
# (il brief elenca nei «Prossimi passi» cosa conviene rieseguire).

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

SLUG="${1:-}"; OPERAZIONE="${2:-}"; ARGOMENTO="${3:-}"
[ -n "$SLUG" ] && [ -n "$OPERAZIONE" ] || error "Uso: spada_integra.sh <slug> documento <percorso> | brief"

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
PIPELINE_DIR="${SPADA_PIPELINE_DIR:-$(cd "$(dirname "$_SELF")/../.." && pwd)}"
GARA_DIR="$GARE_DIR/$SLUG"
source "$(dirname "$_SELF")/spada_comune.sh"

[ -f "$GARA_DIR/manifest.json" ] || error "Gara non trovata o senza manifest.json: $GARA_DIR"
cd "$GARA_DIR"
[ -f "02_graph/index.md" ] || error "Il grafo non esiste ancora: le informazioni nuove entrano con la Fase 2, non serve un'integrazione."

case "$OPERAZIONE" in
  documento)
    [ -n "$ARGOMENTO" ] || error "Indica il percorso del documento (es. input/elaborati/X.pdf)."
    case "$ARGOMENTO" in /*|*..*) error "Percorso non valido: $ARGOMENTO" ;; esac
    case "$ARGOMENTO" in input/*) ;; *) error "Il documento deve stare sotto input/: $ARGOMENTO" ;; esac
    [ -f "$ARGOMENTO" ] || error "Documento non trovato: $ARGOMENTO"
    COMANDO="documento"; OGGETTO="documento $ARGOMENTO" ;;
  brief)
    COMANDO="brief"; OGGETTO="riallineamento del gara brief" ;;
  *) error "Operazione non valida: $OPERAZIONE (documento | brief)" ;;
esac
COMANDO_FILE="$PIPELINE_DIR/comandi/integrazioni/${COMANDO}.md"
[ -f "$COMANDO_FILE" ] || error "Istruzioni mancanti: $COMANDO_FILE"

PIPELINE_VERSION="$(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
GIT_REF="$(git -C "$PIPELINE_DIR" rev-parse --short HEAD 2>/dev/null || echo n.d.)"
PREZZARIO_VERSION="$(versione_prezzario_gara 2>/dev/null || echo null)"
RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
AVVIATO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MODELLO="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['modello'])")"
EFFORT="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['effort'])")"
INIZIO_EPOCH="$(date +%s)"

python3 - "$RUN_ID" "$AVVIATO_IL" "$PIPELINE_VERSION (git $GIT_REF)" "$PREZZARIO_VERSION" "$MODELLO" "$EFFORT" "$OGGETTO" <<'PY'
import json, sys
run_id, avviato_il, pv, pzv, modello, effort, oggetto = sys.argv[1:8]
with open("_state/run_log.json") as f:
    log = json.load(f)
log["runs"].append({
    "run_id": run_id, "fase": 2, "oggetto": oggetto, "riesecuzione": False,
    "avviato_il": avviato_il, "concluso_il": None,
    "pipeline_version": pv, "prezzario_version": json.loads(pzv) if pzv != "null" else None,
    "modello": modello, "effort": effort, "esito": "in_corso", "errore": None,
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)
PY

info "Integrazione: $OGGETTO — run $RUN_ID"

PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"' EXIT
{
  echo "Stai integrando nel contesto della gara $SLUG: $OGGETTO."
  echo "Segui esattamente le istruzioni in _pipeline/comandi/integrazioni/${COMANDO}.md (risolto da $SPADA_CLAUDE_DIR/commands/integrazioni/${COMANDO}.md)."
  [ "$COMANDO" = "documento" ] && echo "Documento da integrare: \`$ARGOMENTO\`."
  echo "Registro delle domande: \`python3 \"$DOMANDE_PY\" ...\` (vedi le istruzioni), sempre con la gara come directory corrente."
  echo ""
  nota_percorsi
  echo ""
  nota_prezzario
  echo ""
  echo "Contesto iniziale — _state/memoria.md:"
  echo '```'
  cat "_state/memoria.md" 2>/dev/null || echo "(vuoto)"
  echo '```'
  echo ""
  echo "Stato delle fasi — _state/fasi.json:"
  echo '```json'
  cat "_state/fasi.json"
  echo '```'
} > "$PROMPT_FILE"

set +e
# shellcheck disable=SC2046
bash "$SPADA_CLAUDE" -p "$(cat "$PROMPT_FILE")" \
  --model "$(modello_cli "$MODELLO")" $(effort_cli "$EFFORT") \
  --permission-mode "$SPADA_PERMISSION_MODE" \
  --output-format stream-json --verbose \
  > "_state/run_${RUN_ID}.stream.jsonl" 2>&1
ESITO_CODICE=$?
set -e
CONCLUSO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

modificato_dopo_inizio() { [ -f "$1" ] && [ "$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1")" -ge "$INIZIO_EPOCH" ]; }

ESITO="completato"; ERRORE=""
if [ $ESITO_CODICE -ne 0 ]; then
  ESITO="errore"; ERRORE="claude -p e' uscito con codice $ESITO_CODICE."
elif ! modificato_dopo_inizio "output/03_criteria/gara_brief.md"; then
  ESITO="errore"; ERRORE="Il gara brief non e' stato aggiornato: l'informazione non e' arrivata al brief."
elif [ "$COMANDO" = "documento" ] && ! modificato_dopo_inizio "02_graph/log.md"; then
  ESITO="errore"; ERRORE="02_graph/log.md non e' stato aggiornato: il documento non risulta integrato nel grafo."
fi
if [ "$ESITO" = "errore" ]; then
  DIAGNOSI="$(diagnosi_stream "_state/run_${RUN_ID}.stream.jsonl" || true)"
  [ -z "$DIAGNOSI" ] || ERRORE="$ERRORE $DIAGNOSI"
fi
chiudi_agenti_rimasti "$ESITO" || true

python3 - "$RUN_ID" "$CONCLUSO_IL" "$ESITO" "$ERRORE" "$COMANDO" "$ARGOMENTO" <<'PY'
import json, os, sys, tempfile
run_id, concluso_il, esito, errore, comando, argomento = sys.argv[1:7]
with open("_state/run_log.json") as f:
    log = json.load(f)
for run in reversed(log["runs"]):
    if run["run_id"] == run_id:
        run.update(concluso_il=concluso_il, esito=esito, errore=errore or None)
        break
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)

# Stato delle integrazioni per documento: lo legge l'interfaccia per
# sapere quali file caricati dopo la Fase 2 sono già nel contesto.
p = "_state/integrazioni.json"
try:
    with open(p) as f:
        stato = json.load(f)
except (OSError, ValueError):
    stato = {}
chiave = argomento if comando == "documento" else "_brief"
stato[chiave] = {"esito": esito, "run_id": run_id, "concluso_il": concluso_il, "errore": errore or None}
fd, tmp = tempfile.mkstemp(dir="_state", prefix=".integrazioni-")
with os.fdopen(fd, "w") as f:
    json.dump(stato, f, ensure_ascii=False, indent=2)
os.replace(tmp, p)
PY

if [ "$ESITO" = "errore" ]; then
  warn "Integrazione conclusa con errore: $ERRORE"
  warn "Stream completo: _state/run_${RUN_ID}.stream.jsonl"
  exit 1
fi
info "Integrazione completata — run $RUN_ID"
