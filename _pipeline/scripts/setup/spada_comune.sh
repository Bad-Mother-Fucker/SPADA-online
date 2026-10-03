#!/bin/bash
# spada_comune.sh — funzioni condivise da spada_fase.sh e
# spada_deliverable.sh (versione locale). Si include con `source`, non
# si esegue.
#
# Compatibile con il bash 3.2 di macOS: niente array associativi
# (`declare -A`), che sulla VM Ubuntu (bash 5) erano disponibili.

SPADA_HOME="${SPADA_HOME:-$HOME/spada}"
SPADA_CLAUDE_DIR="${SPADA_CLAUDE_DIR:-$SPADA_HOME/_claude}"
SPADA_DATA_DIR="${SPADA_DATA_DIR:-$SPADA_HOME/_data}"
SPADA_DB_PATH="${SPADA_DB_PATH:-$SPADA_DATA_DIR/spada.db}"
# Modalita' permessi delle sessioni che scrivono (fasi, deliverable,
# interventi). "auto": Claude Code approva da solo le azioni ordinarie e
# blocca quelle rischiose — sul Mac personale dell'operatore, con
# documenti di gara non fidati in ingresso, e' il compromesso giusto.
# Configurabile in ~/spada/spada.env.
SPADA_PERMISSION_MODE="${SPADA_PERMISSION_MODE:-auto}"

SPADA_CLAUDE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/spada_claude.sh"
PREZZARIO_GARA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prezzario_gara.py"

# Prezzario della gara (cwd = radice della gara). La fase parte anche
# senza: la nota nel prompt dice all'agente di saltare le valutazioni
# economiche, e run_log.json registra prezzario_version = null, da cui
# il backend capisce cosa rielaborare quando il prezzario arriva.
versione_prezzario_gara() { python3 "$PREZZARIO_GARA" manifest.json "$SPADA_DB_PATH" id; }
nota_prezzario()          { python3 "$PREZZARIO_GARA" manifest.json "$SPADA_DB_PATH" nota; }

nome_fase() {
  case "$1" in
    1) echo "1_acquisizione_documenti" ;;
    2) echo "2_costruzione_grafo" ;;
    3) echo "3_analisi_strategica" ;;
    4) echo "4_elaborazione_criteri" ;;
    5) echo "5_revisione_proposte" ;;
    6) echo "6_stesura_offerta" ;;
    7) echo "7_approvazione_finale" ;;
  esac
}

# Fasi con gate umano (3, 5, 7) e fasi senza agente (5, 7).
fase_con_gate_umano() { case "$1" in 3|5|7) return 0 ;; *) return 1 ;; esac; }
fase_senza_agente()   { case "$1" in 5|7) return 0 ;; *) return 1 ;; esac; }

# Gli id modello scritti nei manifest della VM (claude-sonnet-5,
# claude-opus-5) diventano alias della CLI, che puntano sempre
# all'ultima versione disponibile per la subscription.
modello_cli() {
  case "$1" in
    claude-sonnet-5|"") echo "sonnet" ;;
    claude-opus-5) echo "opus" ;;
    *) echo "$1" ;;
  esac
}

# Effort accettati da `claude --effort`; un valore diverso nel manifest
# non deve far fallire la fase, si lascia il default della CLI.
effort_cli() {
  case "$1" in
    low|medium|high|xhigh|max) echo "--effort $1" ;;
    *) echo "" ;;
  esac
}

# Nota da aggiungere a ogni prompt: agenti, skill e comandi citano
# percorsi come `.claude/skills/...` o `scripts/...`, che sulla VM si
# risolvevano in ~/.claude. Qui vivono nella config dedicata.
nota_percorsi() {
  cat <<NOTA
Risoluzione dei percorsi della pipeline: i riferimenti a \`.claude/agents/\`, \`.claude/skills/\`, \`.claude/commands/\`, \`.claude/templates/\`, \`~/.claude/...\`, \`_pipeline/comandi/\`, \`scripts/\` e \`references/\` che trovi in agenti, skill e comandi si risolvono in \`$SPADA_CLAUDE_DIR/\` (rispettivamente \`agents/\`, \`skills/\`, \`commands/\`, \`templates/\`, \`scripts/\`, \`references/\`), non nella directory della gara e non in ~/.claude. Esempi: \`references/graph-schema.md\` → \`$SPADA_CLAUDE_DIR/references/graph-schema.md\`; \`node scripts/graph/graph_lint.js\` → \`node "$SPADA_CLAUDE_DIR/scripts/graph/graph_lint.js"\` (lanciato con la gara come directory corrente). Tutto ciò che sta sotto \`input/\`, \`output/\`, \`02_graph/\`, \`_state/\`, \`manifest.json\` e \`vincoli_offerta_tecnica.md\` è invece nella directory della gara.
NOTA
}
