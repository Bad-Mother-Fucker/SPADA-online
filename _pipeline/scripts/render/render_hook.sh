#!/bin/bash
# render_hook.sh — hook PostToolUse: rigenera l'artifact HTML ogni volta che
# un agente scrive o modifica un output markdown del sistema.
#
# Riceve su stdin il payload JSON dell'hook di Claude Code, ne estrae
# tool_input.file_path e chiama il renderer. Se il file non e' in whitelist
# (scripts/render/md_to_html.js → DOC_TYPES) il renderer non fa nulla.
#
# Non fallisce mai in modo bloccante: un artifact non generato non deve
# interrompere il lavoro di un agente. Esce sempre 0.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PAYLOAD="$(cat)"

FILE_PATH="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
print((d.get("tool_input") or {}).get("file_path", ""))
' 2>/dev/null)"

[ -n "$FILE_PATH" ] || exit 0
case "$FILE_PATH" in *.md) ;; *) exit 0 ;; esac
[ -f "$FILE_PATH" ] || exit 0

node "$ROOT/scripts/render/md_to_html.js" "$FILE_PATH" >/dev/null 2>&1 || true
exit 0
