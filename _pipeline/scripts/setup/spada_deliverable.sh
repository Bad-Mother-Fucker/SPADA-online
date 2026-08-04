#!/bin/bash
# spada_deliverable.sh — esegue UN deliverable di UNA gara come
# invocazione a se' stante di Claude Code headless (Sprint 10.3).
#
# A differenza di spada_fase.sh (che esegue una fase intera in un colpo
# solo), qui ogni deliverable richiesto dal disciplinare
# (manifest.json -> deliverables) e' un'esecuzione indipendente, con il
# proprio agente dedicato al tipo di documento (relazione tecnica,
# computo metrico, Legge 10, cronoprogramma, tavole tecniche). Piu'
# deliverable della stessa gara si eseguono uno alla volta (coda job
# FIFO, Sprint 4.2), non in processi concorrenti — nessun lock aggiuntivo
# necessario qui.
#
# Uso:
#   spada_deliverable.sh <slug> <deliverable_id>              — esegue
#   spada_deliverable.sh <slug> <deliverable_id> --riesegui    — riesegue:
#                                                    archivia l'output
#                                                    precedente, non lo cancella
#
# <deliverable_id> e' l'id stabile "{criterio}-{indice}" (es. "C1-0"),
# stesso ordine di manifest.json -> deliverables[criterio] (vedi
# app/backend/deliverables.py -> elenca_deliverables).

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

SLUG="${1:-}"; DELIVERABLE_ID="${2:-}"; FLAG="${3:-}"
[ -n "$SLUG" ] && [ -n "$DELIVERABLE_ID" ] || error "Uso: spada_deliverable.sh <slug> <deliverable_id> [--riesegui]"

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
PIPELINE_DIR="${SPADA_PIPELINE_DIR:-$(cd "$(dirname "$_SELF")/../.." && pwd)}"
GARA_DIR="$GARE_DIR/$SLUG"

[ -d "$GARA_DIR" ] || error "Gara non trovata: $GARA_DIR"
[ -f "$GARA_DIR/manifest.json" ] || error "manifest.json mancante in $GARA_DIR — non è una gara valida."

cd "$GARA_DIR"
mkdir -p _state

# ── Risolvi il deliverable da manifest.json (stessa logica di
#    app/backend/deliverables.py::elenca_deliverables, qui in Python
#    per condividere il parsing JSON senza duplicarlo in bash) ────────
DELIVERABLE_JSON="$(python3 - "$DELIVERABLE_ID" <<'PY'
import json, sys
deliverable_id = sys.argv[1]
with open("manifest.json") as f:
    manifest = json.load(f)
for criterio, voci in (manifest.get("deliverables") or {}).items():
    for i, voce in enumerate(voci):
        if f"{criterio}-{i}" == deliverable_id:
            print(json.dumps({**voce, "criterio": criterio, "tipo": voce.get("tipo", "altro")}))
            sys.exit(0)
sys.exit(1)
PY
)" || error "Deliverable '$DELIVERABLE_ID' non trovato in manifest.json → deliverables."

TIPO="$(echo "$DELIVERABLE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tipo"])')"
CRITERIO="$(echo "$DELIVERABLE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["criterio"])')"
NOME="$(echo "$DELIVERABLE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["nome"])')"

# Mappa tipo -> agente dedicato: tenuta in sincronia a mano con
# AGENTE_PER_TIPO in app/backend/deliverables.py (Sprint 10.3).
declare -A AGENTE_PER_TIPO=(
  [relazione_tecnica]="offer-writer"
  [computo_metrico]="deliverable-computo-metrico"
  [legge_10]="deliverable-legge-10"
  [cronoprogramma]="deliverable-cronoprogramma"
  [tavole_tecniche]="deliverable-tavole-tecniche"
  [altro]="deliverable-generico"
)
AGENTE="${AGENTE_PER_TIPO[$TIPO]:-deliverable-generico}"
COMANDO_FILE="_pipeline/comandi/deliverables/${TIPO}.md"

if [ "$TIPO" = "relazione_tecnica" ]; then
  OUTPUT_DIR="output/10_offer"
else
  OUTPUT_DIR="output/10_offer/${DELIVERABLE_ID}"
fi

# ── --riesegui: archivia l'output precedente, non lo cancella ───────
if [ "$FLAG" = "--riesegui" ]; then
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  ARCHIVIO="output/_archivio/$TS/deliverables/$DELIVERABLE_ID"
  if [ -d "$OUTPUT_DIR" ] && [ -n "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]; then
    mkdir -p "$(dirname "$ARCHIVIO")"
    cp -r "$OUTPUT_DIR" "$ARCHIVIO"
  fi
  info "Riesecuzione deliverable $DELIVERABLE_ID: output precedente archiviato in $ARCHIVIO (non cancellato)."
fi

mkdir -p "$OUTPUT_DIR"

# ── Versione pipeline (stesso principio di spada_fase.sh) ───────────
PIPELINE_VERSION="$(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
GIT_REF="$(git -C "$PIPELINE_DIR" rev-parse --short HEAD 2>/dev/null || echo n.d.)"
PIPELINE_VERSION_FULL="$PIPELINE_VERSION (git $GIT_REF)"
MODELLO="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['modello'])")"
EFFORT="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['effort'])")"

# ── Registrazione run + stato deliverable, PRIMA di invocare claude ──
RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
AVVIATO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$RUN_ID" "$AVVIATO_IL" "$PIPELINE_VERSION_FULL" "$MODELLO" "$EFFORT" "$DELIVERABLE_ID" "$AGENTE" "$OUTPUT_DIR" <<'PY'
import json, sys
run_id, avviato_il, pv, modello, effort, deliverable_id, agente, output_dir = sys.argv[1:9]

try:
    with open("_state/run_log.json") as f:
        log = json.load(f)
except FileNotFoundError:
    log = {"runs": []}
log["runs"].append({
    "run_id": run_id, "fase": 6, "riesecuzione": False,
    "avviato_il": avviato_il, "concluso_il": None,
    "pipeline_version": pv, "prezzario_version": None,
    "modello": modello, "effort": effort, "esito": "in_corso", "errore": None,
    "deliverable_id": deliverable_id,
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)

try:
    with open("_state/deliverables.json") as f:
        stato = json.load(f)
except FileNotFoundError:
    stato = {}
stato[deliverable_id] = {
    "stato": "in_esecuzione", "agente": agente, "run_id": run_id,
    "iniziata_il": avviato_il, "output_dir": output_dir,
}
with open("_state/deliverables.json", "w") as f:
    json.dump(stato, f, ensure_ascii=False, indent=2)

# Fase 6 nel suo insieme e' "in_esecuzione" finche' almeno un
# deliverable e' in corso o da eseguire, indipendentemente da quanti
# altri sono gia' completati.
with open("_state/fasi.json") as f:
    fasi = json.load(f)
fasi["fase_corrente"] = 6
fasi["fasi"]["6_stesura_offerta"]["stato"] = "in_esecuzione"
fasi["fasi"]["6_stesura_offerta"]["sintesi"] = f"Deliverable in esecuzione: {deliverable_id} ({agente})."
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY

info "Deliverable $DELIVERABLE_ID ($TIPO, criterio $CRITERIO) — agente $AGENTE — run $RUN_ID"

# ── Costruzione prompt ───────────────────────────────────────────────
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"' EXIT

{
  echo "Stai eseguendo il deliverable '$DELIVERABLE_ID' ($NOME) della gara $SLUG come invocazione a se' stante."
  echo "Tipo deliverable: $TIPO — criterio: $CRITERIO — cartella output: $OUTPUT_DIR/"
  echo "Segui esattamente le istruzioni in $COMANDO_FILE (risolto da \$HOME/.claude/commands/deliverables/${TIPO}.md)."
  echo ""
  echo "Dati del deliverable da manifest.json:"
  echo '```json'
  echo "$DELIVERABLE_JSON"
  echo '```'
  echo ""
  echo "Contesto iniziale — _state/memoria.md:"
  echo '```'
  cat "_state/memoria.md" 2>/dev/null || echo "(vuoto)"
  echo '```'
} > "$PROMPT_FILE"

# ── Invocazione headless ─────────────────────────────────────────────
set +e
claude -p "$(cat "$PROMPT_FILE")" \
  --setting-sources user \
  --model "$MODELLO" \
  --output-format stream-json --verbose \
  > "_state/run_${RUN_ID}.stream.jsonl" 2>&1
ESITO_CODICE=$?
set -e

CONCLUSO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── Verifica minima: il deliverable deve aver scritto qualcosa ──────
ESITO="completato"; ERRORE="null"
if [ $ESITO_CODICE -ne 0 ]; then
  ESITO="errore"; ERRORE="\"claude -p e' uscito con codice $ESITO_CODICE\""
elif [ -z "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]; then
  ESITO="errore"; ERRORE="\"$OUTPUT_DIR/ e' vuota: il deliverable non ha prodotto output.\""
fi

python3 - "$RUN_ID" "$CONCLUSO_IL" "$ESITO" "$ERRORE" "$DELIVERABLE_ID" "$AGENTE" "$OUTPUT_DIR" <<'PY'
import json, sys
run_id, concluso_il, esito, errore_raw, deliverable_id, agente, output_dir = sys.argv[1:8]
errore = json.loads(errore_raw)

with open("_state/run_log.json") as f:
    log = json.load(f)
for run in reversed(log["runs"]):
    if run["run_id"] == run_id:
        run["concluso_il"] = concluso_il
        run["esito"] = esito
        run["errore"] = errore
        break
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)

with open("_state/deliverables.json") as f:
    stato = json.load(f)
stato[deliverable_id] = {
    "stato": "completata" if esito == "completato" else "errore",
    "agente": agente, "run_id": run_id, "output_dir": output_dir,
    "iniziata_il": stato.get(deliverable_id, {}).get("iniziata_il", concluso_il),
    "conclusa_il": concluso_il,
}
with open("_state/deliverables.json", "w") as f:
    json.dump(stato, f, ensure_ascii=False, indent=2)

# Fase 6 nel suo insieme e' "completata" solo quando OGNI deliverable
# elencato in manifest.json lo e'; "errore" solo se nessuno e' ancora
# da eseguire/in corso e almeno uno e' fallito; altrimenti resta
# "in_esecuzione" (ce ne sono ancora da lanciare o falliti da rilanciare).
with open("manifest.json") as f:
    manifest = json.load(f)
tutti_gli_id = [f"{c}-{i}" for c, voci in (manifest.get("deliverables") or {}).items() for i in range(len(voci))]
stati = [stato.get(i, {}).get("stato", "da_eseguire") for i in tutti_gli_id]

if tutti_gli_id and all(s == "completata" for s in stati):
    fase6_stato = "completata"
    sintesi = f"Tutti i {len(tutti_gli_id)} deliverable completati."
elif any(s in ("da_eseguire", "in_esecuzione") for s in stati):
    n_fatti = sum(1 for s in stati if s == "completata")
    fase6_stato = "in_esecuzione"
    sintesi = f"{n_fatti}/{len(tutti_gli_id)} deliverable completati."
else:
    fase6_stato = "errore"
    sintesi = f"{sum(1 for s in stati if s == 'errore')}/{len(tutti_gli_id)} deliverable in errore, nessuno ancora da eseguire."

with open("_state/fasi.json") as f:
    fasi = json.load(f)
fasi["fasi"]["6_stesura_offerta"]["stato"] = fase6_stato
fasi["fasi"]["6_stesura_offerta"]["sintesi"] = sintesi
fasi["fasi"]["6_stesura_offerta"]["conclusa_il"] = concluso_il
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY

if [ "$ESITO" = "errore" ]; then
  warn "Deliverable $DELIVERABLE_ID concluso con errore — vedi _state/run_${RUN_ID}.stream.jsonl"
  exit 1
fi

info "Deliverable $DELIVERABLE_ID completato — run $RUN_ID — output in $OUTPUT_DIR/"
