#!/bin/bash
# spada_deliverable.sh — esegue UNO stadio di UN deliverable dell'offerta
# come invocazione a se' stante di Claude Code headless.
#
# Un deliverable e' un documento intero dell'offerta (la relazione
# tecnica, il computo delle migliorie, …), non la sua parte per un
# criterio: il raggruppamento delle voci di manifest.json → deliverables
# sta in deliverables_offerta.py. I tipi con un procedimento definito
# (skill dedicata) si producono per stadi approvati uno alla volta dal
# professionista: relazione tecnica scaletta → bozza → definitivo,
# computo metrico voci → bozza → definitivo. Gli altri hanno un solo
# stadio. Piu' deliverable si eseguono uno alla volta (coda job FIFO).
#
# Uso:
#   spada_deliverable.sh <slug> <deliverable_id> [--riesegui] [--argomento <json>]
#     senza argomento   → produce il primo stadio non ancora prodotto
#     --riesegui        → riparte dal primo stadio; l'output precedente
#                         si archivia, non si cancella
#     --riesegui --argomento '{"stadio": "bozza"}'
#                       → rifa' da zero solo quello stadio (i successivi
#                         tornano da produrre); archiviati anche loro
#     --argomento '{"stadio": "bozza", "nota": "…"}'
#                       → rifa' quello stadio applicando la nota del
#                         professionista (richiesta di modifiche)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

SLUG="${1:-}"; DELIVERABLE_ID="${2:-}"; shift 2 || true
FLAG=""; ARGOMENTO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --riesegui) FLAG="--riesegui" ;;
    --argomento) ARGOMENTO="${2:-}"; shift ;;
  esac
  shift
done
[ -n "$SLUG" ] && [ -n "$DELIVERABLE_ID" ] || error "Uso: spada_deliverable.sh <slug> <deliverable_id> [--riesegui] [--argomento <json>]"

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
PIPELINE_DIR="${SPADA_PIPELINE_DIR:-$(cd "$(dirname "$_SELF")/../.." && pwd)}"
GARA_DIR="$GARE_DIR/$SLUG"
OFFERTA_PY="$(dirname "$_SELF")/deliverables_offerta.py"
source "$(dirname "$_SELF")/spada_comune.sh"

[ -d "$GARA_DIR" ] || error "Gara non trovata: $GARA_DIR"
[ -f "$GARA_DIR/manifest.json" ] || error "manifest.json mancante in $GARA_DIR — non è una gara valida."

cd "$GARA_DIR"
mkdir -p _state

# ── Riesecuzione: prima si archivia (copia, mai cancellato senza copia)
#    e si azzera lo stadio da rifare, con i successivi; senza stadio
#    nell'argomento si riparte da capo ───────────────────────────────
[ "$FLAG" = "--riesegui" ] && [ -z "$ARGOMENTO" ] && ARGOMENTO='{"da_capo": true}'
if [ "$FLAG" = "--riesegui" ]; then
  ARCHIVIO="$(python3 "$OFFERTA_PY" rifai "$DELIVERABLE_ID" "$ARGOMENTO")" || error "Deliverable '$DELIVERABLE_ID' non trovato fra i documenti dell'offerta."
  [ -z "$ARCHIVIO" ] || info "Riesecuzione di $DELIVERABLE_ID: versione precedente archiviata in $ARCHIVIO (non cancellata)."
fi

# ── Deliverable e stadio da eseguire ────────────────────────────────
DL_JSON="$(python3 "$OFFERTA_PY" risolvi "$DELIVERABLE_ID" "$ARGOMENTO")" || error "$(python3 "$OFFERTA_PY" risolvi "$DELIVERABLE_ID" "$ARGOMENTO" 2>&1 >/dev/null || true)"
campo() { echo "$DL_JSON" | python3 -c "import json,sys; v=json.load(sys.stdin).get('$1'); print(v if v is not None else '')"; }
TIPO="$(campo tipo)"; NOME="$(campo nome)"; AGENTE="$(campo agente)"; SKILL="$(campo skill)"
OUTPUT_DIR="$(campo cartella)"; STADIO="$(campo stadio)"; STADIO_ETICHETTA="$(campo stadio_etichetta)"
FILE_STADIO="$(campo file_stadio)"; NOTA="$(campo nota)"
COMANDO_FILE="_pipeline/comandi/deliverables/${TIPO}.md"
mkdir -p "$OUTPUT_DIR"

# ── Versione pipeline (stesso principio di spada_fase.sh) ───────────
PIPELINE_VERSION="$(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
GIT_REF="$(git -C "$PIPELINE_DIR" rev-parse --short HEAD 2>/dev/null || echo n.d.)"
PIPELINE_VERSION_FULL="$PIPELINE_VERSION (git $GIT_REF)"
MODELLO="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['modello'])")"
EFFORT="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['effort'])")"
PREZZARIO_VERSION="$(versione_prezzario_gara 2>/dev/null || echo null)"

# ── Registrazione run + stato, PRIMA di invocare claude ─────────────
RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
AVVIATO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Stadio interrotto: si riprende la sua sessione, tranne con --riesegui o
# con una richiesta di modifiche (riparte con la nota).
SESSIONE_RIPRESA=""
if [ "$FLAG" != "--riesegui" ] && [ -z "$NOTA" ]; then
  SESSIONE_RIPRESA="$(sessione_interrotta "" "$DELIVERABLE_ID" || true)"
  if [ -n "$SESSIONE_RIPRESA" ]; then
    STADIO_INTERROTTO="$(python3 -c "
import json
runs=json.load(open('_state/run_log.json'))['runs']
print(next((r.get('stadio') or '' for r in reversed(runs) if r.get('session_id')=='$SESSIONE_RIPRESA'), ''))")"
    [ "$STADIO_INTERROTTO" = "$STADIO" ] || SESSIONE_RIPRESA=""
  fi
fi
SESSIONE="${SESSIONE_RIPRESA:-$RUN_ID}"

python3 - "$RUN_ID" "$AVVIATO_IL" "$PIPELINE_VERSION_FULL" "$MODELLO" "$EFFORT" "$DELIVERABLE_ID" "$PREZZARIO_VERSION" "$SESSIONE" "$SESSIONE_RIPRESA" "$STADIO" <<'PY'
import json, sys
run_id, avviato_il, pv, modello, effort, deliverable_id, pzv, sessione, ripresa, stadio = sys.argv[1:11]
try:
    with open("_state/run_log.json") as f:
        log = json.load(f)
except FileNotFoundError:
    log = {"runs": []}
log["runs"].append({
    "run_id": run_id, "fase": 7, "riesecuzione": False,
    "avviato_il": avviato_il, "concluso_il": None,
    "pipeline_version": pv, "prezzario_version": json.loads(pzv),
    "modello": modello, "effort": effort, "esito": "in_corso", "errore": None,
    "deliverable_id": deliverable_id, "stadio": stadio, "session_id": sessione, "ripresa": bool(ripresa),
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)
# Lo stato della Fase 7 non si tocca qui: che un deliverable giri lo dice
# la coda dei job (il backend lo sovrappone a fasi.json).
with open("_state/fasi.json") as f:
    fasi = json.load(f)
fasi["fase_corrente"] = 7
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY
python3 - "$OFFERTA_PY" "$DELIVERABLE_ID" "$STADIO" "$RUN_ID" <<'PY'
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("offerta", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
dl = m.trova(json.load(open("manifest.json")), sys.argv[2])
m.segna_avvio(Path.cwd(), dl, sys.argv[3], sys.argv[4])
PY

info "Deliverable $DELIVERABLE_ID ($TIPO) — stadio «$STADIO_ETICHETTA» — agente $AGENTE — run $RUN_ID"
[ -z "$SESSIONE_RIPRESA" ] || info "Ripresa della sessione interrotta $SESSIONE_RIPRESA: continua da dove si era fermato."

# ── Costruzione prompt ───────────────────────────────────────────────
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"' EXIT
{
  echo "Stai producendo il deliverable «$NOME» (id $DELIVERABLE_ID, tipo $TIPO) della gara $SLUG come invocazione a se' stante."
  echo "È un documento unico dell'offerta: copre tutti i criteri indicati qui sotto, non una parte per criterio."
  echo "Agente: $AGENTE. Cartella del deliverable: $OUTPUT_DIR/"
  if [ -n "$SKILL" ]; then
    echo ""
    echo "Procedimento: segui la skill $SKILL (risolta da $SPADA_CLAUDE_DIR/skills/$SKILL/SKILL.md) e le istruzioni in $COMANDO_FILE (risolto da $SPADA_CLAUDE_DIR/commands/deliverables/${TIPO}.md)."
    echo "Esegui SOLO lo stadio «$STADIO_ETICHETTA» ($STADIO): scrivi $FILE_STADIO e fermati. Gli stadi successivi partono dopo l'approvazione del professionista, in un'altra sessione."
    PRECEDENTI="$(echo "$DL_JSON" | python3 -c 'import json,sys; print("\n".join(json.load(sys.stdin)["stadi_precedenti"]))')"
    if [ -n "$PRECEDENTI" ]; then
      echo "Stadi già approvati dal professionista, da seguire fedelmente (eventuali modifiche a mano sono sue e sono vincolanti):"
      echo "$PRECEDENTI" | sed 's/^/- /'
    fi
  else
    echo "Segui esattamente le istruzioni in $COMANDO_FILE (risolto da $SPADA_CLAUDE_DIR/commands/deliverables/${TIPO}.md). Scrivi l'output in $OUTPUT_DIR/."
    if [ "$TIPO" = "altro" ]; then
      # Stesse regole di scrittura della relazione tecnica, da un'unica fonte.
      echo "Se il documento è un testo descrittivo per la commissione (relazione di sintesi, elenco descrittivo delle proposte, altre relazioni), applica le sezioni «Regola di nomenclatura», «Stile del testo» e «Lunghezza: avvicinarsi al limite» di $SPADA_CLAUDE_DIR/skills/deliverable-relazione-tecnica/SKILL.md: leggile prima di scrivere. Il limite di facciate è nel vincolo di formato del deliverable; stima le facciate come nella sezione «Stima delle facciate» e scrivi nel riepilogo finale facciate stimate e percentuale del limite."
    fi
  fi
  if [ -n "$NOTA" ]; then
    echo ""
    echo "RICHIESTA DI MODIFICHE del professionista su questo stadio. Il file attuale ($FILE_STADIO) è la versione da correggere: rileggilo e riscrivilo applicando questa nota, senza toccare ciò che la nota non chiede di cambiare:"
    echo "> $NOTA"
  fi
  echo ""
  echo "Proposte da usare: solo quelle approvate dal professionista nella Fase 6, secondo lo stato dei nodi in 02_graph/proposals/ (vale sopra registri, schede, memoria e stadi precedenti, che possono riportare decisioni superate):"
  python3 "$OFFERTA_PY" proposte
  echo ""
  # Figure scelte dal professionista (solo relazione tecnica, se ce ne sono).
  FIGURE="$(python3 "$(dirname "$OFFERTA_PY")/grafiche_offerta.py" elenco "$DELIVERABLE_ID" 2>/dev/null || true)"
  if [ -n "$FIGURE" ]; then
    echo "$FIGURE"
    echo ""
  fi
  # Schede tecniche scelte dal professionista (solo relazione tecnica):
  # sono gli unici documenti di prodotto che il testo può dire allegati.
  SCHEDE="$(python3 "$(dirname "$OFFERTA_PY")/schede_offerta.py" elenco "$DELIVERABLE_ID" 2>/dev/null || true)"
  if [ -n "$SCHEDE" ]; then
    echo "$SCHEDE"
    echo ""
  fi
  nota_percorsi
  echo ""
  nota_prezzario
  echo ""
  echo "Dati del deliverable (voci di manifest.json raggruppate):"
  echo '```json'
  echo "$DL_JSON"
  echo '```'
  echo ""
  echo "Contesto iniziale — _state/memoria.md:"
  echo '```'
  cat "_state/memoria.md" 2>/dev/null || echo "(vuoto)"
  echo '```'
} > "$PROMPT_FILE"

# ── Invocazione headless (ripresa e interruzione come in spada_fase.sh) ─
if [ -n "$SESSIONE_RIPRESA" ]; then
  OPZIONE_SESSIONE="--resume"; prompt_ripresa > "$PROMPT_FILE"
else
  OPZIONE_SESSIONE="--session-id"
fi
INTERROTTO=0
trap 'INTERROTTO=1' TERM INT
set +e
# shellcheck disable=SC2046  # effort_cli e' vuoto o "--effort <livello>"
bash "$SPADA_CLAUDE" -p "$(cat "$PROMPT_FILE")" "$OPZIONE_SESSIONE" "$SESSIONE" \
  --model "$(modello_cli "$MODELLO")" $(effort_cli "$EFFORT") \
  --permission-mode "$SPADA_PERMISSION_MODE" \
  --output-format stream-json --verbose \
  > "_state/run_${RUN_ID}.stream.jsonl" 2>&1
ESITO_CODICE=$?
set -e
CONCLUSO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── Verifica: lo stadio deve aver scritto (o riscritto) il suo file ──
ESITO="completato"; ERRORE=""
if [ "$INTERROTTO" = 1 ]; then
  ESITO="interrotto"; ERRORE="Interrotto durante «$STADIO_ETICHETTA»: alla prossima esecuzione riprende da dove si era fermato."
elif [ $ESITO_CODICE -ne 0 ]; then
  ESITO="errore"; ERRORE="claude -p e' uscito con codice $ESITO_CODICE."
elif [ -n "$FILE_STADIO" ]; then
  if [ ! -s "$FILE_STADIO" ]; then
    ESITO="errore"; ERRORE="«$STADIO_ETICHETTA» non scritto: $FILE_STADIO manca o è vuoto."
  elif [ -n "$NOTA" ] && [ "$(date -r "$FILE_STADIO" -u +%Y-%m-%dT%H:%M:%SZ)" \< "$AVVIATO_IL" ]; then
    ESITO="errore"; ERRORE="«$STADIO_ETICHETTA» non riscritto: la richiesta di modifiche non è stata applicata."
  fi
elif [ -z "$(ls -A "$OUTPUT_DIR" 2>/dev/null)" ]; then
  ESITO="errore"; ERRORE="$OUTPUT_DIR/ e' vuota: il deliverable non ha prodotto output."
fi
# ── Nomenclatura interna vietata dalla bozza in poi: una correzione nella
#    stessa sessione, poi errore con l'elenco dei codici rimasti ─────────
if [ "$ESITO" = "completato" ]; then
  set +e
  INTERNI="$(python3 "$OFFERTA_PY" controlla "$DELIVERABLE_ID" "$STADIO")"
  if [ $? -eq 4 ]; then
    warn "Nomenclatura interna nel testo, chiedo la correzione: $INTERNI"
    # Relazione tecnica (skill, «Stile del testo»): elaborati solo col titolo esteso, senza riferimenti puntuali.
    if [ "$TIPO" = "relazione_tecnica" ]; then
      ELABORATI="elaborati solo con il titolo esteso (es. «Elenco prezzi unitari»), senza sigla dell'elaborato, voce, articolo o pagina"
    else
      ELABORATI="elaborati con il nome con cui sono stati caricati (più voce, tavola, articolo o pagina)"
    fi
    CORREZIONE="Nel testo che hai scritto ci sono riferimenti con la nomenclatura interna del sistema, vietata nei documenti per la stazione appaltante:
$INTERNI
Riscrivi quei passaggi: criteri e sub-criteri con numerazione e denominazione del disciplinare, $ELABORATI, proposte con il loro titolo descrittivo. Niente codici P-/G-/E-/D-/Q-/R-/X-, TAV-M-, wikilink [[…]] o percorsi interni. Non cambiare nient'altro."
    # shellcheck disable=SC2046
    bash "$SPADA_CLAUDE" -p "$CORREZIONE" --resume "$SESSIONE" \
      --model "$(modello_cli "$MODELLO")" $(effort_cli "$EFFORT") \
      --permission-mode "$SPADA_PERMISSION_MODE" \
      --output-format stream-json --verbose \
      >> "_state/run_${RUN_ID}.stream.jsonl" 2>&1
    [ "$INTERROTTO" = 1 ] && { ESITO="interrotto"; ERRORE="Interrotto durante la correzione della nomenclatura."; }
    INTERNI="$(python3 "$OFFERTA_PY" controlla "$DELIVERABLE_ID" "$STADIO")"
    if [ $? -eq 4 ] && [ "$ESITO" = "completato" ]; then
      ESITO="errore"; ERRORE="Restano riferimenti con la nomenclatura interna, vietata nei documenti per la stazione appaltante: $INTERNI. Correggili nel testo o chiedi modifiche."
    fi
  fi
  set -e
fi
if [ "$ESITO" = "errore" ]; then
  DIAGNOSI="$(diagnosi_stream "_state/run_${RUN_ID}.stream.jsonl" || true)"
  [ -z "$DIAGNOSI" ] || ERRORE="$ERRORE $DIAGNOSI"
  # Un agente che si ferma di proposito (prerequisito mancante) lo spiega
  # nella risposta finale: è il motivo da mostrare, non solo «non scritto».
  SPIEGAZIONE="$(python3 - "_state/run_${RUN_ID}.stream.jsonl" <<'PY'
import json, sys
testo = ""
for riga in open(sys.argv[1], encoding="utf-8", errors="ignore"):
    try:
        e = json.loads(riga)
    except ValueError:
        continue
    if e.get("type") == "result" and isinstance(e.get("result"), str):
        testo = e["result"]
print(" ".join(testo.split())[:900])
PY
)"
  [ -z "$SPIEGAZIONE" ] || ERRORE="$ERRORE L'agente dice: $SPIEGAZIONE"
fi
chiudi_agenti_rimasti "$ESITO" || true

python3 - "$RUN_ID" "$CONCLUSO_IL" "$ESITO" "$ERRORE" <<'PY'
import json, sys
run_id, concluso_il, esito, errore = sys.argv[1:5]
with open("_state/run_log.json") as f:
    log = json.load(f)
for run in reversed(log["runs"]):
    if run["run_id"] == run_id:
        run.update(concluso_il=concluso_il, esito=esito, errore=errore or None)
        break
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)
PY
python3 "$OFFERTA_PY" concludi "$DELIVERABLE_ID" "$STADIO" "$ESITO" "$ERRORE"

if [ "$ESITO" = "interrotto" ]; then
  warn "Deliverable $DELIVERABLE_ID interrotto: rieseguendolo riprende la sessione $SESSIONE."
  exit 143
fi
if [ "$ESITO" = "errore" ]; then
  warn "Deliverable $DELIVERABLE_ID, stadio $STADIO, concluso con errore: $ERRORE"
  warn "Stream completo: _state/run_${RUN_ID}.stream.jsonl"
  exit 1
fi
info "Deliverable $DELIVERABLE_ID: «$STADIO_ETICHETTA» pronto — run $RUN_ID — $OUTPUT_DIR/"
