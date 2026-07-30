#!/bin/bash
# deploy.sh — eseguito SULLA VM via SSH da .github/workflows/deploy.yml
# (piped come stdin, `bash -s -- <deploy_path> <commit_sha>`). Non lo
# si lancia mai a mano in condizioni normali: il workflow lo invoca ad
# ogni push su main che tocca backend/worker/pipeline.
#
# Idempotente: rieseguirlo con lo stesso commit non fa danni (git pull
# non cambia nulla, pip install è no-op, restart è sempre sicuro).

set -euo pipefail

DEPLOY_PATH="${1:?Uso: deploy.sh <percorso-repo-sulla-vm> <commit-sha>}"
COMMIT_SHA="${2:?Uso: deploy.sh <percorso-repo-sulla-vm> <commit-sha>}"

echo "▶ Deploy $COMMIT_SHA in $DEPLOY_PATH"
cd "$DEPLOY_PATH"

# ── Codice ────────────────────────────────────────────────────────
git fetch origin main
git reset --hard "$COMMIT_SHA"

# ── Dipendenze Python (backend + worker condividono lo stesso venv,
#    vedi infra/DEPLOY.md) ──────────────────────────────────────────
VENV="$DEPLOY_PATH/app/backend/.venv"
if [ ! -d "$VENV" ]; then
  echo "✗ Venv non trovato in $VENV — esegui prima il setup iniziale (infra/DEPLOY.md § 3)."
  exit 1
fi
"$VENV/bin/pip" install -q -r "$DEPLOY_PATH/app/backend/requirements.txt"

# ── Dipendenze del server MCP prezzario, se presente (facoltativo:
#    non tutte le gare lo usano, ma se e' installato va aggiornato) ──
PREZZARIO_VENV="$DEPLOY_PATH/_pipeline/mcp/prezzario/.venv"
if [ -d "$PREZZARIO_VENV" ]; then
  "$PREZZARIO_VENV/bin/pip" install -q -r "$DEPLOY_PATH/_pipeline/mcp/prezzario/requirements.txt"
fi

# ── Riavvio servizi — richiede sudo passwordless scoped (vedi
#    infra/DEPLOY.md § Deploy automatico, riga sudoers da aggiungere
#    una tantum) ──────────────────────────────────────────────────
sudo systemctl daemon-reload
sudo systemctl restart spada-api
sudo systemctl restart spada-worker

echo "▶ Deploy completato. Stato servizi:"
sudo systemctl is-active spada-api spada-worker
