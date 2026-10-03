#!/bin/bash
# link_pipeline.sh — collega la pipeline condivisa alla directory di
# configurazione Claude Code DEDICATA a SPADA (versione locale), cosi'
# che ogni invocazione headless lanciata da spada_claude.sh, con
# working directory in una qualsiasi gara, risolva agenti/skill/
# comandi/hook dalla versione corrente di _pipeline/ senza alcuna
# copia per gara.
#
# Differenza dalla VM: li' i symlink stavano in ~/.claude di un utente
# di sistema dedicato. Sul Mac ~/.claude e' la configurazione personale
# dell'operatore: qui i symlink vanno in SPADA_CLAUDE_DIR (default
# ~/spada/_claude), che spada_claude.sh passa a claude come
# CLAUDE_CONFIG_DIR. ~/.claude non viene mai toccato.
#
# Idempotente: puo' essere rieseguito ad ogni release di _pipeline
# senza effetti collaterali (i symlink vengono ricreati, non duplicati).
#
# Uso:
#   ./link_pipeline.sh ~/spada/_pipeline

set -e

PIPELINE_DIR="${1:-}"
if [ -z "$PIPELINE_DIR" ] || [ ! -d "$PIPELINE_DIR" ]; then
  echo "Uso: $0 <percorso _pipeline/>" >&2
  exit 1
fi
# Niente `pwd -P`: se _pipeline e' raggiunto via symlink (~/spada/_pipeline
# → cartella del progetto) si tiene il percorso del symlink, senza spazi.
PIPELINE_DIR="$(cd "$PIPELINE_DIR" && pwd)"

SPADA_HOME="${SPADA_HOME:-$HOME/spada}"
CLAUDE_DIR="${SPADA_CLAUDE_DIR:-$SPADA_HOME/_claude}"
DATA_DIR="${SPADA_DATA_DIR:-$SPADA_HOME/_data}"
DB_PATH="${SPADA_DB_PATH:-$DATA_DIR/spada.db}"

case "$(cd "$(dirname "$CLAUDE_DIR")" 2>/dev/null && pwd)/$(basename "$CLAUDE_DIR")" in
  "$HOME/.claude"|"$HOME/.claude/")
    echo "✗ SPADA_CLAUDE_DIR punta a ~/.claude, la configurazione personale: usa una directory dedicata." >&2
    exit 1 ;;
esac

mkdir -p "$CLAUDE_DIR"

link() {
  local target="$1" name="$2"
  if [ -L "$CLAUDE_DIR/$name" ]; then
    rm "$CLAUDE_DIR/$name"
  elif [ -e "$CLAUDE_DIR/$name" ]; then
    echo "✗ $CLAUDE_DIR/$name esiste già e non è un symlink: risolvi manualmente prima di rieseguire." >&2
    exit 1
  fi
  ln -s "$target" "$CLAUDE_DIR/$name"
  echo "▶ $CLAUDE_DIR/$name → $target"
}

link "$PIPELINE_DIR/agents"   "agents"
link "$PIPELINE_DIR/comandi"  "commands"
link "$PIPELINE_DIR/scripts"  "scripts"
link "$PIPELINE_DIR/templates" "templates"
link "$PIPELINE_DIR/settings.json" "settings.json"

# references/graph-schema.md: il percorso con cui agenti e skill citano lo
# schema dei nodi (eredità di prometeus-spada); il file sta in _pipeline/.
mkdir -p "$CLAUDE_DIR/references"
[ -L "$CLAUDE_DIR/references/graph-schema.md" ] && rm "$CLAUDE_DIR/references/graph-schema.md"
ln -s "$PIPELINE_DIR/graph-schema.md" "$CLAUDE_DIR/references/graph-schema.md"
echo "▶ $CLAUDE_DIR/references/graph-schema.md → $PIPELINE_DIR/graph-schema.md"

# skills/ e' una cartella vera con un symlink per ogni skill, non un
# symlink a _pipeline/skills: Claude Code scrive in <config>/skills/synced/
# la copia delle skill dell'account claude.ai, che altrimenti finirebbe
# dentro il codice della pipeline.
[ -L "$CLAUDE_DIR/skills" ] && rm "$CLAUDE_DIR/skills"
mkdir -p "$CLAUDE_DIR/skills"
for voce in "$CLAUDE_DIR/skills"/*; do
  [ -L "$voce" ] && rm "$voce"   # skill rimosse o rinominate nella pipeline
done
for skill in "$PIPELINE_DIR/skills"/*/; do
  nome="$(basename "$skill")"
  [ "$nome" = "synced" ] && continue
  ln -s "$PIPELINE_DIR/skills/$nome" "$CLAUDE_DIR/skills/$nome"
done
echo "▶ $CLAUDE_DIR/skills/ → una voce per skill di $PIPELINE_DIR/skills"

echo ""
echo "▶ Pubblico il design system in _data/ (Sprint 5)..."
mkdir -p "$DATA_DIR"
[ -L "$DATA_DIR/design-system.css" ] && rm "$DATA_DIR/design-system.css"
ln -s "$PIPELINE_DIR/design/design-system.css" "$DATA_DIR/design-system.css"

echo ""
echo "▶ Preparo il venv del server MCP prezzario..."
bash "$PIPELINE_DIR/mcp/prezzario/setup.sh"

echo ""
echo "▶ Scrivo la configurazione MCP dedicata (solo il server prezzario)..."
# Al posto di `claude mcp add --scope user`: un file passato con
# --mcp-config --strict-mcp-config da spada_claude.sh, cosi' una fase
# vede solo questo server e nessun altro.
python3 - "$CLAUDE_DIR/mcp-spada.json" "$PIPELINE_DIR/mcp/prezzario/run.sh" "$DB_PATH" <<'PY'
import json, sys
dest, run_sh, db_path = sys.argv[1:4]
config = {"mcpServers": {"prezzario": {
    "type": "stdio", "command": "bash", "args": [run_sh],
    "env": {"SPADA_DB_PATH": db_path},
}}}
with open(dest, "w") as f:
    json.dump(config, f, indent=2)
PY
echo "  $CLAUDE_DIR/mcp-spada.json"

echo ""
echo "Pipeline condivisa collegata: $PIPELINE_DIR"
echo "Versione: $(cat "$PIPELINE_DIR/VERSION" 2>/dev/null || echo sconosciuta)"
