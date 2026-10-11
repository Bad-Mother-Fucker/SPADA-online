#!/bin/bash
# spada_fase.sh — esegue UNA fase di UNA gara come invocazione a se'
# stante di Claude Code headless (Sprint 3.1). Nessun processo appeso
# in attesa di approvazioni umane. Due tipi di intervento umano:
#   - Fase 4 (domande al professionista): il professionista risponde
#     dall'interfaccia quando vuole; eseguire la fase = inviare le
#     risposte, che solo allora entrano nel contesto (memoria, grafo,
#     brief). Ha un agente, come le fasi ordinarie.
#   - Fasi 6 e 8 (checkpoint umani): si chiudono con --approva dopo che
#     l'intervento e' avvenuto. Fase 6: --approva scrive le decisioni
#     sulle proposte nei Cx_output.md e le fa elaborare a
#     feedback-processor, un criterio alla volta. Fase 8: approvazione
#     del plico, senza agente.
#
# Uso:
#   spada-fase <slug> <numero_fase>              — esegue la fase
#   spada-fase <slug> <numero_fase> --riesegui    — riesegue: archivia
#                                                    l'output precedente,
#                                                    marca le fasi a
#                                                    valle "da_rivedere"
#   spada-fase <slug> <numero_fase> --approva     — solo per fasi 6/8:
#                                                    6 elabora le decisioni,
#                                                    8 marca "completata"
#                                                    senza invocare claude
#
# Variabili di ambiente:
#   SPADA_GARE_DIR      — default: ~/spada/gare
#   SPADA_PIPELINE_DIR  — default: ~/spada/_pipeline
#   SPADA_PERMISSION_MODE, SPADA_CLAUDE_DIR, SPADA_DB_PATH — vedi spada_comune.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; exit 1; }

SLUG="${1:-}"; FASE="${2:-}"; FLAG="${3:-}"
[ -n "$SLUG" ] && [ -n "$FASE" ] || error "Uso: spada-fase <slug> <numero_fase> [--riesegui|--approva]"
case "$FASE" in 1|2|3|4|5|6|7|8) ;; *) error "Numero fase non valido: $FASE (deve essere 1-8)" ;; esac

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
# Default: risali da questo script (scripts/setup/spada_fase.sh) alla
# radice di _pipeline/. Funziona anche attraverso il symlink creato da
# link_pipeline.sh in ~/.local/bin, perche' risolviamo il link stesso
# prima di calcolare i due "..".
_SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
PIPELINE_DIR="${SPADA_PIPELINE_DIR:-$(cd "$(dirname "$_SELF")/../.." && pwd)}"
GARA_DIR="$GARE_DIR/$SLUG"
source "$(dirname "$_SELF")/spada_comune.sh"

[ -d "$GARA_DIR" ] || error "Gara non trovata: $GARA_DIR"
[ -f "$GARA_DIR/manifest.json" ] || error "manifest.json mancante in $GARA_DIR — non è una gara valida."

NOME_FASE="$(nome_fase "$FASE")"

cd "$GARA_DIR"

# ── Versione pipeline (Sprint 1.3 / 3.2) ────────────────────────────
PIPELINE_VERSION="$(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
GIT_REF="$(git -C "$PIPELINE_DIR" rev-parse --short HEAD 2>/dev/null || echo n.d.)"
PIPELINE_VERSION_FULL="$PIPELINE_VERSION (git $GIT_REF)"

# ── Versione prezzario, se questa gara ne consulta uno (best-effort) ─
# null se l'edizione non è importata: la fase gira lo stesso, senza
# valutazioni economiche (vedi nota_prezzario più sotto).
PREZZARIO_VERSION="$(versione_prezzario_gara 2>/dev/null || echo null)"

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

# ── Fase 6 --approva: conferma della revisione delle proposte ────────
# Le decisioni prese nell'interfaccia (tabella approvazioni) si scrivono
# parola per parola nei Cx_output.md (decisioni_proposte.py), poi
# feedback-processor le elabora un criterio alla volta: nodi in
# 02_graph/proposals/, index, registri, brief, stato_feedback. Non avvia
# la Fase 7. Rieseguita, salta i criteri già elaborati le cui decisioni
# non sono cambiate: dopo un'interruzione riprende dal criterio rimasto.
if [ "$FLAG" = "--approva" ] && [ "$FASE" = "6" ]; then
  DECISIONI_PY="$(dirname "$_SELF")/decisioni_proposte.py"
  MODELLO="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['modello'])")"
  EFFORT="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['effort'])")"

  segna_fase6() {  # $1 = stato, $2 = sintesi
    python3 - "$1" "$2" <<'PY'
import json, sys
from datetime import datetime, timezone
stato, sintesi = sys.argv[1:3]
now = datetime.now(timezone.utc).isoformat()
with open("_state/fasi.json") as f:
    fasi = json.load(f)
corpo = fasi["fasi"]["6_revisione_proposte"]
corpo["stato"], corpo["sintesi"] = stato, sintesi
if stato == "in_esecuzione":
    fasi["fase_corrente"] = 6
    corpo["iniziata_il"] = now
    corpo.pop("conclusa_il", None)
else:
    corpo["conclusa_il"] = now
if stato == "completata":
    corpo["richiede_approvazione"] = False
    # La Fase 7 non parte: i suoi deliverable si sbloccano e si avviano
    # uno per uno. Quelli già scritti non conoscevano queste decisioni:
    # tornano «da rivedere» (vanno rieseguiti), non si cancellano.
    try:
        with open("_state/deliverables.json") as f:
            dl = json.load(f)
    except (OSError, ValueError):
        dl = {}
    vecchi = [k for k, v in dl.items() if v.get("stato") == "completata"]
    for k in vecchi:
        dl[k]["stato"] = "da_rivedere"
        dl[k]["nota"] = "Scritto prima della conferma della revisione delle proposte: va rieseguito."
    if dl:
        with open("_state/deliverables.json", "w") as f:
            json.dump(dl, f, ensure_ascii=False, indent=2)
    f7 = fasi["fasi"].setdefault("7_stesura_offerta", {})
    f7["stato"] = "da_eseguire"
    f7.pop("conclusa_il", None)
    f7["sintesi"] = ("Deliverable sbloccati: si avviano uno per uno."
                     + (f" {len(vecchi)} già scritti prima della conferma vanno rieseguiti." if vecchi else ""))
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY
  }

  segna_fase6 in_esecuzione "Scrittura delle decisioni nelle schede dei criteri."
  set +e
  CRITERI="$(python3 "$DECISIONI_PY" scrivi "$GARA_DIR" "$SPADA_DB_PATH" 2>"_state/decisioni.err")"
  CODICE=$?
  set -e
  if [ $CODICE -ne 0 ]; then
    MOTIVO="$(cat "_state/decisioni.err")"; rm -f "_state/decisioni.err"
    segna_fase6 errore "${MOTIVO:-Decisioni non scritte.}"
    error "${MOTIVO:-Decisioni non scritte nelle schede dei criteri.}"
  fi
  rm -f "_state/decisioni.err"
  info "Decisioni scritte nelle schede. Criteri da elaborare: ${CRITERI:-nessuno}"

  INTERROTTO=0
  trap 'INTERROTTO=1' TERM INT
  for CRITERIO in $CRITERI; do
    RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
    AVVIATO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    segna_fase6 in_esecuzione "Elaborazione delle decisioni: criterio $CRITERIO (feedback-processor)."
    python3 - "$RUN_ID" "$AVVIATO_IL" "$PIPELINE_VERSION_FULL" "$PREZZARIO_VERSION" "$MODELLO" "$EFFORT" "$CRITERIO" <<'PY'
import json, sys
run_id, avviato_il, pv, pzv, modello, effort, criterio = sys.argv[1:8]
with open("_state/run_log.json") as f:
    log = json.load(f)
log["runs"].append({
    "run_id": run_id, "fase": 6, "riesecuzione": False,
    "avviato_il": avviato_il, "concluso_il": None,
    "pipeline_version": pv, "prezzario_version": json.loads(pzv) if pzv != "null" else None,
    "modello": modello, "effort": effort, "esito": "in_corso", "errore": None,
    "session_id": run_id, "ripresa": False, "criterio": criterio,
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)
PY
    PROMPT="Stai elaborando il feedback del professionista sul criterio $CRITERIO della gara $SLUG come invocazione a se' stante (Fase 6, revisione delle proposte).
Segui esattamente le istruzioni in _pipeline/comandi/process_feedback.md (risolto da $SPADA_CLAUDE_DIR/commands/process_feedback.md) con argomento $CRITERIO, usando l'agente feedback-processor.
Le decisioni sono già scritte nei campi **Decisione** e **Note** delle schede in output/05_criteria_outputs/${CRITERIO}_output.md: le ha scritte il sistema dall'interfaccia, parola per parola, e sono definitive. Non chiedere conferme: nessuno risponde in questa sessione. «Approva con modifiche» significa che la nota del professionista dice cosa cambiare: riportala nel nodo come vincolo di redazione. Una proposta senza decisione resta in sospeso e va solo segnalata.

$(nota_percorsi)"
    set +e
    # shellcheck disable=SC2046  # effort_cli e' vuoto o "--effort <livello>"
    bash "$SPADA_CLAUDE" -p "$PROMPT" --session-id "$RUN_ID" \
      --model "$(modello_cli "$MODELLO")" $(effort_cli "$EFFORT") \
      --permission-mode "$SPADA_PERMISSION_MODE" \
      --output-format stream-json --verbose \
      > "_state/run_${RUN_ID}.stream.jsonl" 2>&1
    ESITO_CODICE=$?
    set -e
    ESITO="completato"; ERRORE=""
    if [ "$INTERROTTO" = 1 ]; then
      ESITO="interrotto"; ERRORE="Interrotta durante il criterio $CRITERIO: confermando di nuovo riprende da questo criterio."
    elif [ $ESITO_CODICE -ne 0 ]; then
      ESITO="errore"; ERRORE="Criterio $CRITERIO: claude -p e' uscito con codice $ESITO_CODICE."
    elif ! grep -q "^stato_feedback: completato" "output/05_criteria_outputs/${CRITERIO}_output.md"; then
      ESITO="errore"; ERRORE="Criterio $CRITERIO: feedback-processor non ha chiuso la scheda (stato_feedback non completato)."
    fi
    if [ "$ESITO" = "errore" ]; then
      DIAGNOSI="$(diagnosi_stream "_state/run_${RUN_ID}.stream.jsonl" || true)"
      [ -z "$DIAGNOSI" ] || ERRORE="$ERRORE $DIAGNOSI"
    fi
    chiudi_agenti_rimasti "$ESITO" || true
    python3 - "$RUN_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ESITO" "$ERRORE" <<'PY'
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
    if [ "$ESITO" = "interrotto" ]; then
      segna_fase6 interrotta "$ERRORE"
      warn "$ERRORE"
      exit 143
    fi
    if [ "$ESITO" = "errore" ]; then
      segna_fase6 errore "$ERRORE"
      warn "Stream completo: _state/run_${RUN_ID}.stream.jsonl"
      error "$ERRORE"
    fi
    info "Criterio $CRITERIO: decisioni elaborate — run $RUN_ID"
  done

  python3 "$DECISIONI_PY" memoria "$GARA_DIR" "$SPADA_DB_PATH" || warn "Memoria di gara non aggiornata con la Fase 6."
  python3 "$DECISIONI_PY" vincoli "$GARA_DIR" "$SPADA_DB_PATH" || warn "Sezione B di vincoli_offerta_tecnica.md non compilata."
  segna_fase6 completata "Revisione confermata: decisioni elaborate nel grafo, nei registri e nel brief; Sezione B dei vincoli compilata."
  info "Fase 6 completata: revisione delle proposte confermata. I deliverable della Fase 7 si avviano uno per uno."
  exit 0
fi

# ── --approva: solo gate umani, nessuna invocazione claude ───────────
if [ "$FLAG" = "--approva" ]; then
  fase_con_gate_umano "$FASE" || error "--approva si usa solo sulle fasi 6 e 8 (checkpoint umano senza agente)."
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

# ── Fasi 6 e 8 senza --approva: riportano lo stato, non invocano nulla ─
if fase_senza_agente "$FASE"; then
  info "Fase $FASE ($NOME_FASE) è un gate umano: nessun agente da eseguire."
  case "$FASE" in
    6) [ -f output/06_registers/proposal_register.md ] && \
       tail -n 40 output/06_registers/proposal_register.md || \
       warn "output/06_registers/proposal_register.md non trovato ancora." ;;
    8) [ -d output/10_offer ] && ls output/10_offer || \
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
  # Le scansioni senza testo si leggono con l'OCR prima del gate (per le
  # gare la cui Fase 1 è girata prima che l'OCR esistesse; le nuove lo
  # fanno a fine Fase 1).
  python3 "$(dirname "${BASH_SOURCE[0]}")/ocr_scansioni.py" "$GARA_DIR" || true
  if ! python3 "$(dirname "${BASH_SOURCE[0]}")/verifica_completezza.py" "$GARA_DIR"; then
    error "Fase 3 bloccata: estrazione documentale incompleta (vedi sopra). Completa document-preprocessor prima di procedere."
  fi
fi

# ── Registrazione run (Sprint 3.2) — PRIMA di invocare claude ────────
RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
AVVIATO_IL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MODELLO="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['modello'])")"
EFFORT="$(python3 -c "import json;print(json.load(open('manifest.json'))['esecuzione']['effort'])")"
# Fase interrotta: si riprende la sua sessione (vedi spada_comune.sh),
# tranne con --riesegui, che riparte da capo.
SESSIONE_RIPRESA=""
[ "$FLAG" = "--riesegui" ] || SESSIONE_RIPRESA="$(sessione_interrotta "$FASE" "" || true)"
SESSIONE="${SESSIONE_RIPRESA:-$RUN_ID}"

python3 - "$FASE" "$RUN_ID" "$AVVIATO_IL" "$PIPELINE_VERSION_FULL" "$PREZZARIO_VERSION" "$MODELLO" "$EFFORT" "$SESSIONE" "$SESSIONE_RIPRESA" <<'PY'
import json, sys
fase, run_id, avviato_il, pv, pzv, modello, effort, sessione, ripresa = sys.argv[1:10]
fase = int(fase)

with open("_state/run_log.json") as f:
    log = json.load(f)
log["runs"].append({
    "run_id": run_id, "fase": fase, "riesecuzione": False,
    "avviato_il": avviato_il, "concluso_il": None,
    "pipeline_version": pv, "prezzario_version": json.loads(pzv) if pzv != "null" else None,
    "modello": modello, "effort": effort, "esito": "in_corso", "errore": None,
    "session_id": sessione, "ripresa": bool(ripresa),
})
with open("_state/run_log.json", "w") as f:
    json.dump(log, f, ensure_ascii=False, indent=2)

with open("_state/fasi.json") as f:
    fasi = json.load(f)
chiave = next(k for k in fasi["fasi"] if k.startswith(f"{fase}_"))
fasi["fase_corrente"] = fase
fasi["fasi"][chiave]["stato"] = "in_esecuzione"
fasi["fasi"][chiave]["iniziata_il"] = avviato_il
fasi["fasi"][chiave].pop("conclusa_il", None)  # di un run precedente
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY

info "Fase $FASE ($NOME_FASE) — run $RUN_ID — pipeline $PIPELINE_VERSION_FULL"
[ -z "$SESSIONE_RIPRESA" ] || info "Ripresa della sessione interrotta $SESSIONE_RIPRESA: continua da dove si era fermata."

# ── Fase 4: le risposte del professionista, scritte prima dell'agente ─
# Il digest (output/07_questions/risposte_professionista.md) e il
# paragrafo della memoria li scrive domande.py, non il modello: ciò che il
# professionista ha scritto arriva a valle parola per parola. L'agente
# lo integra poi nel grafo e nel brief.
if [ "$FASE" = "4" ]; then
  python3 "$DOMANDE_PY" consolida --run "$RUN_ID" >/dev/null \
    || error "Fase 4: impossibile consolidare le risposte (output/07_questions/domande.json)."
fi

# ── Costruzione prompt: memoria + handoff della fase precedente ─────
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"' EXIT

{
  echo "Stai eseguendo la Fase $FASE ($NOME_FASE) della gara $SLUG come invocazione a se' stante."
  echo "Segui esattamente le istruzioni in _pipeline/comandi/fasi/${NOME_FASE}.md (risolto da $SPADA_CLAUDE_DIR/commands/fasi/${NOME_FASE}.md)."
  echo ""
  nota_percorsi
  echo ""
  nota_prezzario
  echo ""
  echo "Contesto iniziale — _state/memoria.md:"
  echo '```'
  cat "_state/memoria.md" 2>/dev/null || echo "(vuoto)"
  echo '```'
  if [ "$FASE" -gt 1 ]; then
    PREV=$((FASE - 1))
    PREV_NOME="$(nome_fase "$PREV")"
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
# Una ripresa non ripete il prompt iniziale: è già nella sessione.
if [ -n "$SESSIONE_RIPRESA" ]; then
  OPZIONE_SESSIONE="--resume"; prompt_ripresa > "$PROMPT_FILE"
else
  OPZIONE_SESSIONE="--session-id"
fi
# SIGTERM arriva dal worker a tutto il gruppo («Interrompi», arresto di
# SPADA): claude si chiude salvando la sessione, bash esegue la trap
# quando claude è uscito e lo script registra l'interruzione.
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

# ── Verifica: handoff e memoria.md devono essere stati aggiornati ────
ESITO="completato"; ERRORE=""
if [ "$INTERROTTO" = 1 ]; then
  ESITO="interrotto"; ERRORE="Interrotta prima della fine: alla prossima esecuzione riprende da dove si era fermata."
elif [ $ESITO_CODICE -ne 0 ]; then
  ESITO="errore"; ERRORE="claude -p e' uscito con codice $ESITO_CODICE."
elif [ ! -f "_state/handoff/${NOME_FASE}.json" ]; then
  ESITO="errore"; ERRORE="_state/handoff/${NOME_FASE}.json non e' stato scritto: catena verso la fase successiva rotta."
fi
# La causa vera (stderr della CLI, risultato con errore) sta nello
# stream: si allega al motivo, che run_log.json e l'interfaccia mostrano.
if [ "$ESITO" = "errore" ]; then
  DIAGNOSI="$(diagnosi_stream "_state/run_${RUN_ID}.stream.jsonl" || true)"
  [ -z "$DIAGNOSI" ] || ERRORE="$ERRORE $DIAGNOSI"
fi
# claude e' uscito: chi e' ancora in agenti_attivi non lo e' davvero.
chiudi_agenti_rimasti "$ESITO" || true

# Fase 1 riuscita: le scansioni senza testo segnate da
# document-preprocessor si leggono con l'OCR, così la Fase 2 le trova
# già estratte.
if [ "$FASE" = "1" ] && [ "$ESITO" = "completato" ]; then
  python3 "$(dirname "${BASH_SOURCE[0]}")/ocr_scansioni.py" "$GARA_DIR" || warn "OCR delle scansioni non completato: si riprova prima della Fase 3."
fi

# Fase 4 riuscita: le risposte risultano inviate, e indicazioni e risposte
# finiscono nelle decisioni dell'handoff che la Fase 5 riceve nel prompt.
if [ "$FASE" = "4" ] && [ "$ESITO" = "completato" ]; then
  python3 "$DOMANDE_PY" handoff "_state/handoff/${NOME_FASE}.json" || warn "Fase 4: decisioni non aggiunte all'handoff."
  python3 "$DOMANDE_PY" segna-inviate --run "$RUN_ID" || warn "Fase 4: risposte non segnate come inviate."
fi

python3 - "$FASE" "$RUN_ID" "$CONCLUSO_IL" "$ESITO" "$ERRORE" "$AVVIATO_IL" <<'PY'
import json, sys
fase, run_id, concluso_il, esito, errore, avviato_il = sys.argv[1:7]
fase = int(fase)
errore = errore or None

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
fasi["fasi"][chiave]["stato"] = {"completato": "completata", "interrotto": "interrotta"}.get(esito, "errore")
fasi["fasi"][chiave]["conclusa_il"] = concluso_il
fasi["fasi"][chiave].pop("richiede_approvazione", None)

# Sintesi a fine run: l'hook Stop la riscrive a ogni turno
# dell'orchestratore ("N agenti al lavoro"); qui si chiude con il
# consuntivo degli agenti di questo run (confronto sui primi 19
# caratteri: gli hook scrivono microsecondi e offset, lo script no).
try:
    with open("_state/attivita.json") as f:
        conclusi = [a for a in json.load(f).get("agenti_conclusi", [])
                    if (a.get("concluso_il") or "")[:19] >= avviato_il[:19]]
except (OSError, ValueError):
    conclusi = []
if conclusi:
    interrotti = sum(1 for a in conclusi if a.get("stato") == "interrotto")
    sintesi = f"{len(conclusi)} agenti conclusi in questo run"
    sintesi += f", {interrotti} interrotti." if interrotti else "."
    fasi["fasi"][chiave]["sintesi"] = sintesi
with open("_state/fasi.json", "w") as f:
    json.dump(fasi, f, ensure_ascii=False, indent=2)
PY

if [ "$ESITO" = "interrotto" ]; then
  warn "Fase $FASE interrotta: rieseguendola (senza --riesegui) riprende la sessione $SESSIONE."
  exit 143
fi
if [ "$ESITO" = "errore" ]; then
  warn "Fase $FASE conclusa con errore: $ERRORE"
  warn "Stream completo: _state/run_${RUN_ID}.stream.jsonl"
  exit 1
fi

info "Fase $FASE completata — run $RUN_ID"
if fase_con_gate_umano "$FASE"; then
  warn "Richiede approvazione umana prima di considerarla chiusa: spada-fase $SLUG $FASE --approva quando fatto."
fi
