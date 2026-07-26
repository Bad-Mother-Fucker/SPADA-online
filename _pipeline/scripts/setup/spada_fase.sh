#!/bin/bash
# spada_fase.sh — esegue UNA fase di UNA gara come invocazione a se'
# stante di Claude Code headless (Sprint 3.1). Nessun processo appeso
# in attesa di approvazioni umane: le fasi con intervento umano (3, 5,
# 7) si fermano da sole e si sbloccano con --approva dopo che
# l'intervento e' avvenuto fuori banda (file, o Sprint 4/6 API/UI).
#
# Uso:
#   spada-fase <slug> <numero_fase>              — esegue la fase
#   spada-fase <slug> <numero_fase> --riesegui    — riesegue: archivia
#                                                    l'output precedente,
#                                                    marca le fasi a
#                                                    valle "da_rivedere"
#   spada-fase <slug> <numero_fase> --approva     — solo per fasi 3/5/7:
#                                                    marca "completata"
#                                                    senza invocare claude
#
# Variabili di ambiente:
#   SPADA_GARE_DIR      — default: ~/spada/gare
#   SPADA_PIPELINE_DIR  — default: ~/spada/_pipeline

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

SLUG="${1:-}"; FASE="${2:-}"; FLAG="${3:-}"
[ -n "$SLUG" ] && [ -n "$FASE" ] || error "Uso: spada-fase <slug> <numero_fase> [--riesegui|--approva]"
case "$FASE" in 1|2|3|4|5|6|7) ;; *) error "Numero fase non valido: $FASE (deve essere 1-7)" ;; esac

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
# Default: risali da questo script (scripts/setup/spada_fase.sh) alla
# radice di _pipeline/. Funziona anche attraverso il symlink creato da
# link_pipeline.sh in ~/.local/bin, perche' risolviamo il link stesso
# prima di calcolare i due "..".
_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
PIPELINE_DIR="${SPADA_PIPELINE_DIR:-$(cd "$(dirname "$_SELF")/../.." && pwd)}"
GARA_DIR="$GARE_DIR/$SLUG"

[ -d "$GARA_DIR" ] || error "Gara non trovata: $GARA_DIR"
[ -f "$GARA_DIR/manifest.json" ] || error "manifest.json mancante in $GARA_DIR — non è una gara valida."

declare -A NOMI_FASE=(
  [1]="1_acquisizione_documenti" [2]="2_costruzione_grafo" [3]="3_analisi_strategica"
  [4]="4_elaborazione_criteri"  [5]="5_revisione_proposte" [6]="6_stesura_offerta"
  [7]="7_approvazione_finale"
)
NOME_FASE="${NOMI_FASE[$FASE]}"
declare -A GATE_UMANO=( [3]=1 [5]=1 [7]=1 )
declare -A SENZA_AGENTE=( [5]=1 [7]=1 )

cd "$GARA_DIR"

# ── Versione pipeline (Sprint 1.3 / 3.2) ────────────────────────────
PIPELINE_VERSION="$(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
GIT_REF="$(git -C "$PIPELINE_DIR" rev-parse --short HEAD 2>/dev/null || echo n.d.)"
PIPELINE_VERSION_FULL="$PIPELINE_VERSION (git $GIT_REF)"

# ── Versione prezzario, se questa gara ne consulta uno (best-effort) ─
PREZZARIO_VERSION="null"
if [ -f "$PIPELINE_DIR/../_data/spada.db" ] || [ -f "${SPADA_DB_PATH:-}" ]; then
  DB_PATH="${SPADA_DB_PATH:-$PIPELINE_DIR/../_data/spada.db}"
  REGIONE="$(python3 -c "import json;print(json.load(open('manifest.json'))['prezzario']['regione'])" 2>/dev/null || echo "")"
  ANNO="$(python3 -c "import json;print(json.load(open('manifest.json'))['prezzario']['anno'])" 2>/dev/null || echo "")"
  if [ -n "$REGIONE" ] && [ -n "$ANNO" ]; then
    PREZZARIO_VERSION="$(python3 -c "
import sqlite3, json, sys
try:
    con = sqlite3.connect('$DB_PATH')
    row = con.execute('SELECT regione, anno, hash_sorgente FROM prezzario_versioni WHERE regione=? AND anno=?', ('$REGIONE', $ANNO)).fetchone()
    print(json.dumps(f'{row[0]}-{row[1]}-{row[2]}') if row else 'null')
except Exception:
    print('null')
" 2>/dev/null || echo "null")"
  fi
fi

# ── --riesegui: archivia output precedente, marca fasi a valle ──────
if [ "$FLAG" = "--riesegui" ]; then
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  ARCHIVIO="output/_archivio/$TS/$NOME_FASE"
  mkdir -p "$ARCHIVIO"
  if [ -d "_state/handoff" ] && [ -f "_state/handoff/${NOME_FASE}.json" ]; then
    cp "_state/handoff/${NOME_FASE}.json" "$ARCHIVIO/" 2>/dev/null || true
  fi
  info "Riesecuzione fase $FASE: output precedente archiviato in $ARCHIVIO (non cancellato)."

  python3 - "$FASE" <<'PY'
import json, sys
fase = int(sys.argv[1])
with open("_state/fasi.json") as f:
    data = json.load(f)
for chiave, corpo in data["fasi"].items():
    n = int(chiave.split("_")[0])
    if n > fase and corpo["stato"] == "completata":
        corpo["stato"] = "da_rivedere"
with open("_state/fasi.json", "w") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
PY
fi

# ── --approva: solo gate umani, nessuna invocazione claude ───────────
if [ "$FLAG" = "--approva" ]; then
  [ -n "${GATE_UMANO[$FASE]:-}" ] || error "--approva si usa solo sulle fasi 3, 5, 7 (gate umano)."
  python3 - "$FASE" "$PIPELINE_VERSION_FULL" "$PREZZARIO_VERSION" <<'PY'
import json, sys, uuid
from datetime import datetime, timezone
fase, pv, pzv = int(sys.argv[1]), sys.argv[2], sys.argv[3]
now = datetime.now(timezone.utc).isoformat()

with open("_state/fasi.json") as f:
    fasi = json.load(f)
chiave = next(k for k in fasi["fasi"] if k.startswith(f"{fase}_"))
fasi["fasi"][chiave]["stato"] = "completata"
fasi["fasi"][chiave]["conclusa_il"] = now
fasi["fasi"][chiave]["richiede_approvazione"] = False
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)

with open("_state/run_log.json") as f:
    log = json.load(f)
log["runs"].append({
    "run_id": str(uuid.uuid4()), "fase": fase, "riesecuzione": False,
    "avviato_il": now, "concluso_il": now,
    "pipeline_version": pv, "prezzario_version": json.loads(pzv) if pzv != "null" else None,
    "modello": "n/a (approvazione umana, nessuna invocazione)", "effort": "n/a",
    "esito": "completato", "errore": None,
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)
PY
  info "Fase $FASE marcata completata (approvazione registrata)."
  exit 0
fi

# ── Fasi 5 e 7 senza --approva: riportano lo stato, non invocano nulla ─
if [ -n "${SENZA_AGENTE[$FASE]:-}" ]; then
  info "Fase $FASE ($NOME_FASE) è un gate umano: nessun agente da eseguire."
  case "$FASE" in
    5) [ -f output/06_registers/proposal_register.md ] && \
       tail -n 40 output/06_registers/proposal_register.md || \
       warn "output/06_registers/proposal_register.md non trovato ancora." ;;
    7) [ -d output/10_offer ] && ls output/10_offer || \
       warn "output/10_offer non trovato ancora." ;;
  esac
  echo "Quando l'intervento umano è completo: spada-fase $SLUG $FASE --approva"
  exit 0
fi

# ── Gate di completezza (Sprint 8.5) — solo prima della Fase 3 ───────
# Chiude il difetto noto: un gap prezzi con categorie "non coperte"
# poteva dipendere da estrazione incompleta, non da carenza dei dati
# di riferimento. Blocca esplicitamente invece di lasciare che
# strategy-auditor lo scopra a metà analisi.
if [ "$FASE" = "3" ]; then
  if ! python3 "$(dirname "${BASH_SOURCE[0]}")/verifica_completezza.py" "$GARA_DIR"; then
    error "Fase 3 bloccata: estrazione documentale incompleta (vedi sopra). Completa document-preprocessor prima di procedere."
  fi
fi

# ── Registrazione run (Sprint 3.2) — PRIMA di invocare claude ────────
RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
AVVIATO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MODELLO="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['modello'])")"
EFFORT="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['effort'])")"

python3 - "$FASE" "$RUN_ID" "$AVVIATO_IL" "$PIPELINE_VERSION_FULL" "$PREZZARIO_VERSION" "$MODELLO" "$EFFORT" <<'PY'
import json, sys
fase, run_id, avviato_il, pv, pzv, modello, effort = sys.argv[1:8]
fase = int(fase)

with open("_state/run_log.json") as f:
    log = json.load(f)
log["runs"].append({
    "run_id": run_id, "fase": fase, "riesecuzione": False,
    "avviato_il": avviato_il, "concluso_il": None,
    "pipeline_version": pv, "prezzario_version": json.loads(pzv) if pzv != "null" else None,
    "modello": modello, "effort": effort, "esito": "in_corso", "errore": None,
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)

with open("_state/fasi.json") as f:
    fasi = json.load(f)
chiave = next(k for k in fasi["fasi"] if k.startswith(f"{fase}_"))
fasi["fase_corrente"] = fase
fasi["fasi"][chiave]["stato"] = "in_esecuzione"
fasi["fasi"][chiave]["iniziata_il"] = avviato_il
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY

info "Fase $FASE ($NOME_FASE) — run $RUN_ID — pipeline $PIPELINE_VERSION_FULL"

# ── Costruzione prompt: memoria + handoff della fase precedente ─────
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"' EXIT

{
  echo "Stai eseguendo la Fase $FASE ($NOME_FASE) della gara $SLUG come invocazione a se' stante."
  echo "Segui esattamente le istruzioni in _pipeline/comandi/fasi/${NOME_FASE}.md (risolto da \$HOME/.claude/commands/fasi/${NOME_FASE}.md)."
  echo ""
  echo "Contesto iniziale — _state/memoria.md:"
  echo '```'
  cat "_state/memoria.md" 2>/dev/null || echo "(vuoto)"
  echo '```'
  if [ "$FASE" -gt 1 ]; then
    PREV=$((FASE - 1))
    PREV_NOME="${NOMI_FASE[$PREV]}"
    if [ -f "_state/handoff/${PREV_NOME}.json" ]; then
      echo ""
      echo "Handoff della fase precedente — _state/handoff/${PREV_NOME}.json:"
      echo '```json'
      cat "_state/handoff/${PREV_NOME}.json"
      echo '```'
    fi
  fi
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

# ── Verifica: handoff e memoria.md devono essere stati aggiornati ────
ESITO="completato"; ERRORE="null"
if [ $ESITO_CODICE -ne 0 ]; then
  ESITO="errore"; ERRORE="\"claude -p e' uscito con codice $ESITO_CODICE\""
elif [ ! -f "_state/handoff/${NOME_FASE}.json" ]; then
  ESITO="errore"; ERRORE="\"_state/handoff/${NOME_FASE}.json non e' stato scritto: catena verso la fase successiva rotta.\""
fi

python3 - "$FASE" "$RUN_ID" "$CONCLUSO_IL" "$ESITO" "$ERRORE" <<'PY'
import json, sys
fase, run_id, concluso_il, esito, errore_raw = sys.argv[1:6]
fase = int(fase)
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

with open("_state/fasi.json") as f:
    fasi = json.load(f)
chiave = next(k for k in fasi["fasi"] if k.startswith(f"{fase}_"))
fasi["fasi"][chiave]["stato"] = "completata" if esito == "completato" else "errore"
fasi["fasi"][chiave]["conclusa_il"] = concluso_il
if fase in (3, 5, 7):
    fasi["fasi"][chiave]["richiede_approvazione"] = True
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY

if [ "$ESITO" = "errore" ]; then
  warn "Fase $FASE conclusa con errore — vedi _state/run_${RUN_ID}.stream.jsonl"
  exit 1
fi

info "Fase $FASE completata — run $RUN_ID"
if [ -n "${GATE_UMANO[$FASE]:-}" ]; then
  warn "Richiede approvazione umana prima di considerarla chiusa: spada-fase $SLUG $FASE --approva quando fatto."
fi
