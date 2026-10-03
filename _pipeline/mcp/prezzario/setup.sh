#!/bin/bash
# setup.sh — crea il venv del server MCP prezzario (idempotente).
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
if [ ! -d "$VENV" ]; then
  # SPADA_PYTHON: interprete >= 3.10 scelto da ./spada setup (il python3
  # di sistema di macOS e' 3.9, troppo vecchio per il pacchetto mcp).
  "${SPADA_PYTHON:-python3}" -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$HERE/requirements.txt"
echo "✓ venv pronto: $VENV"
