#!/bin/bash
# run.sh — avvia il server MCP prezzario nel proprio venv.
# Registrato con: claude mcp add --transport stdio prezzario --scope user -- bash <questo file>
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/.venv/bin/python3" "$HERE/server.py"
