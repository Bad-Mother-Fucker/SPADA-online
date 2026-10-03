#!/bin/bash
# spada_claude.sh — unico punto da cui la pipeline lancia `claude`
# (versione locale). Lo usano spada_fase.sh, spada_deliverable.sh e il
# backend (assistente.py, interventi.py): ogni invocazione headless
# passa da qui, cosi' l'isolamento e' definito una volta sola.
#
# Perche' esiste: sulla VM la pipeline viveva in ~/.claude di un utente
# di sistema dedicato (`spada`), via symlink. Sul Mac ~/.claude e' la
# configurazione personale dell'operatore e non va toccata. Qui la
# pipeline ha una propria directory di configurazione Claude Code
# (CLAUDE_CONFIG_DIR, default ~/spada/_claude) con gli stessi symlink
# che sulla VM stavano in ~/.claude — preparata da link_pipeline.sh.
#
# Cosa garantisce:
#   - agenti/skill/comandi/hook risolti da _pipeline/ (scope user della
#     config dedicata), mai da ~/.claude: niente plugin, hook o skill
#     locali dell'operatore (le skill dell'account claude.ai sì, vedi sotto);
#   - un solo server MCP, `prezzario` (--strict-mcp-config): nessun
#     server MCP personale o connettore claude.ai entra in una fase;
#   - autenticazione via login della config dedicata (`./spada login`)
#     o CLAUDE_CODE_OAUTH_TOKEN; mai una ANTHROPIC_API_KEY ereditata
#     dalla shell, che farebbe pagare a consumo invece che con la
#     subscription.
#
# Uso: come `claude`, con gli stessi argomenti
#   spada_claude.sh -p "..." --model sonnet --permission-mode auto

set -euo pipefail

SPADA_HOME="${SPADA_HOME:-$HOME/spada}"
export CLAUDE_CONFIG_DIR="${SPADA_CLAUDE_DIR:-$SPADA_HOME/_claude}"
MCP_CONFIG="$CLAUDE_CONFIG_DIR/mcp-spada.json"

if [ ! -f "$MCP_CONFIG" ]; then
  echo "✗ $MCP_CONFIG non trovato: esegui prima './spada setup'." >&2
  exit 1
fi

unset ANTHROPIC_API_KEY
export ENABLE_CLAUDEAI_MCP_SERVERS=false
# Nota: le skill dell'account claude.ai vengono comunque sincronizzate
# in <config>/skills/synced/ e caricate con prefisso "anthropic-skills:"
# (CLAUDE_CODE_SYNC_SKILLS=0 non lo impedisce, verificato). Restano fuori
# dal codice grazie a skills/ come cartella vera (link_pipeline.sh).

# stdin chiuso: senza un terminale `claude -p` aspetterebbe 3 secondi
# un eventuale input in pipe prima di partire.
exec claude --setting-sources user --strict-mcp-config --mcp-config "$MCP_CONFIG" "$@" </dev/null
