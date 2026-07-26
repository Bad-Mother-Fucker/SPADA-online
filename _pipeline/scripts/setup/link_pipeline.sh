#!/bin/bash
# link_pipeline.sh — collega la pipeline condivisa a ~/.claude tramite
# symlink, cosi' che ogni invocazione di `claude` (headless o meno),
# con working directory in una qualsiasi gara, risolva agenti/skill/
# comandi/hook dalla versione corrente di _pipeline/ senza alcuna copia
# per gara.
#
# Motivazione (vedi docs/sprint1-inventario.md): la CLI Claude Code non
# espone oggi un flag per puntare la discovery di .claude/agents,
# .claude/skills, .claude/commands e degli hook a un percorso arbitrario
# esterno alla working directory e a ~/.claude. Lo scope "user"
# (~/.claude) e' invece la leva stabile: farlo puntare a _pipeline/
# tramite symlink e' l'unico meccanismo che soddisfa "un aggiornamento
# e' immediatamente disponibile a tutte le gare, senza propagazione".
#
# Idempotente: puo' essere rieseguito ad ogni release di _pipeline
# senza effetti collaterali (i symlink vengono ricreati, non duplicati).
#
# Uso:
#   ./link_pipeline.sh /home/mike/spada/_pipeline

set -e

PIPELINE_DIR="${1:-}"
if [ -z "$PIPELINE_DIR" ] || [ ! -d "$PIPELINE_DIR" ]; then
  echo "Uso: $0 <percorso _pipeline/>" >&2
  exit 1
fi
PIPELINE_DIR="$(cd "$PIPELINE_DIR" && pwd)"

CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

link() {
  local target="$1" name="$2"
  if [ -L "$CLAUDE_DIR/$name" ]; then
    rm "$CLAUDE_DIR/$name"
  elif [ -e "$CLAUDE_DIR/$name" ]; then
    echo "✗ $CLAUDE_DIR/$name esiste già e non è un symlink: risolvi manualmente (potrebbe essere config personale dell'operatore) prima di rieseguire." >&2
    exit 1
  fi
  ln -s "$target" "$CLAUDE_DIR/$name"
  echo "▶ $CLAUDE_DIR/$name → $target"
}

link "$PIPELINE_DIR/agents"   "agents"
link "$PIPELINE_DIR/skills"   "skills"
link "$PIPELINE_DIR/comandi"  "commands"
link "$PIPELINE_DIR/scripts"  "scripts"
link "$PIPELINE_DIR/settings.json" "settings.json"

echo ""
echo "▶ Preparo il venv del server MCP prezzario..."
bash "$PIPELINE_DIR/mcp/prezzario/setup.sh"

echo ""
echo "▶ Registro il server MCP prezzario (scope user, idempotente)..."
claude mcp remove prezzario --scope user >/dev/null 2>&1 || true
claude mcp add --transport stdio prezzario --scope user \
  --env "SPADA_DB_PATH=${SPADA_DB_PATH:-$HOME/spada/_data/spada.db}" \
  -- bash "$PIPELINE_DIR/mcp/prezzario/run.sh"

echo ""
echo "Pipeline condivisa collegata: $PIPELINE_DIR"
echo "Versione: $(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
echo ""
echo "Verifica:"
echo "  claude --setting-sources user -p 'elenca gli agenti disponibili'"
echo "  claude mcp list   # deve comparire 'prezzario'"
