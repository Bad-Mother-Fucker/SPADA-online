#!/bin/bash
# backup.sh — backup periodico di gare/, _data/spada.db e dei tag di
# _pipeline/ (Sprint 9.5). Pensato per cron, non interattivo.
#
# Non fa nulla di distruttivo: solo lettura da qui, scrittura solo
# nella destinazione di backup.
#
# Uso:
#   ./backup.sh <destinazione>   (es. rclone remote, o una cartella
#                                  montata da storage esterno)
#
# Variabili di ambiente (opzionali):
#   SPADA_GARE_DIR, SPADA_DATA_DIR, SPADA_PIPELINE_DIR — come altrove

set -euo pipefail

DEST="${1:-}"
[ -n "$DEST" ] || { echo "Uso: $0 <destinazione backup>" >&2; exit 1; }

GARE_DIR="${SPADA_GARE_DIR:-$HOME/spada/gare}"
DATA_DIR="${SPADA_DATA_DIR:-$HOME/spada/_data}"
PIPELINE_DIR="${SPADA_PIPELINE_DIR:-$HOME/spada/_pipeline}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "▶ Backup $TS"

# gare/ — dati di tutte le gare, ciascuna col proprio .git (storico
# incluso). tar preserva la history locale; non fa push da nessuna
# parte.
if [ -d "$GARE_DIR" ]; then
  tar -czf "$STAGING/gare_$TS.tar.gz" -C "$(dirname "$GARE_DIR")" "$(basename "$GARE_DIR")"
  echo "  gare/ archiviato ($(du -sh "$STAGING/gare_$TS.tar.gz" | cut -f1))"
fi

# _data/spada.db — prezzari + stato applicativo. sqlite3 .backup (se
# disponibile) e' piu' sicuro di una copia a caldo: garantisce un
# checkpoint consistente anche con scritture concorrenti.
if [ -f "$DATA_DIR/spada.db" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DATA_DIR/spada.db" ".backup '$STAGING/spada_$TS.db'"
  else
    python3 -c "
import sqlite3
src = sqlite3.connect('$DATA_DIR/spada.db')
dst = sqlite3.connect('$STAGING/spada_$TS.db')
src.backup(dst)
"
  fi
  gzip "$STAGING/spada_$TS.db"
  echo "  spada.db backuppato ($(du -sh "$STAGING/spada_$TS.db.gz" | cut -f1))"
fi

# _pipeline/ — solo i tag (il codice e' già su GitHub): un elenco dei
# tag esistenti basta a ricostruire quale versione girava quando,
# incrociato con run_log.json di ogni gara.
if [ -d "$PIPELINE_DIR/.git" ]; then
  git -C "$PIPELINE_DIR" tag -l > "$STAGING/pipeline_tags_$TS.txt"
  git -C "$PIPELINE_DIR" rev-parse HEAD > "$STAGING/pipeline_head_$TS.txt"
fi

echo "▶ Copio in $DEST"
mkdir -p "$DEST"
cp "$STAGING"/* "$DEST/"

echo "✓ Backup completato: $DEST (prefisso $TS)"
