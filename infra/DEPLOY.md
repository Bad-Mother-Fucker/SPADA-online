# Deploy — SPADA Online (Sprint 9)

Questo runbook presuppone Sprint 0 già completato (VM Oracle Cloud
Always Free, Ubuntu 24.04, Claude Code autenticato via
`CLAUDE_CODE_OAUTH_TOKEN`, `_riferimento/` clonato in sola lettura,
`_pipeline/` e `app/` inizializzati — vedi il piano originale, non
duplicato qui).

**Nessuno di questi passi è stato eseguito da questa sessione**: non
c'è accesso a una VM reale, a un account Cloudflare, né a un token
OAuth reale da questo ambiente di sviluppo. Ogni file in `infra/` è
stato scritto e, dove verificabile senza infrastruttura reale (sintassi
systemd, script di backup, calcolo stima scadenza token), testato in
isolamento — non l'esecuzione end-to-end su una VM vera.

## 1. Preparazione VM

```bash
sudo useradd -m -s /bin/bash spada
sudo mkdir -p /etc/spada
sudo chown root:spada /etc/spada && sudo chmod 750 /etc/spada
# auth.env scritto da Sprint 0.6 (claude setup-token), permessi 600
```

Clona questo repo e `_pipeline/` sulla VM secondo la struttura target:

```bash
sudo -u spada bash -c '
  mkdir -p /home/spada/spada/{gare,_data}
  git clone <url-SPADA-online> /home/spada/spada-online
  git clone <url-_pipeline-se-separato> /home/spada/spada/_pipeline  # o symlink se monorepo
'
```

## 2. Pipeline condivisa

```bash
sudo -u spada bash /home/spada/spada/_pipeline/scripts/setup/link_pipeline.sh /home/spada/spada/_pipeline
```

Verifica: `claude mcp list` deve mostrare `prezzario` connesso;
`~/.claude/agents` deve essere un symlink.

## 3. Backend + worker

```bash
sudo -u spada python3 -m venv /home/spada/spada-online/app/backend/.venv
sudo -u spada /home/spada/spada-online/app/backend/.venv/bin/pip install \
  -r /home/spada/spada-online/app/backend/requirements.txt

sudo cp infra/systemd/spada-api.service infra/systemd/spada-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spada-api spada-worker
sudo systemctl status spada-api spada-worker
```

Adatta i percorsi hardcoded (`/home/spada/...`) nei due `.service` se
l'utente o la struttura di cartelle reale differisce.

## 4. Cloudflare Tunnel

Vedi `infra/cloudflared/config.yml` — passi di setup nel commento in
testa al file. Nessuna porta in ascolto pubblica: il backend resta su
`127.0.0.1:8000`.

## 5. Frontend su Cloudflare Pages

```bash
cd app/frontend
# nessun build step - deploy diretto della cartella
```

Configura `js/config.js` (o un override a build/deploy time) con
`window.SPADA_API_BASE = "https://api.<tuo-dominio>"` — l'hostname del
Tunnel del passo 4.

## 6. Cloudflare Access

Applica una policy Access a **entrambi** gli hostname (frontend Pages
e backend Tunnel) limitata alla singola identità autorizzata
(l'operatore). Senza Access, il backend è raggiungibile da chiunque
conosca l'hostname — CORS da solo non è autenticazione.

## 7. Backup

```bash
crontab -e -u spada
# 0 3 * * * /home/spada/spada-online/infra/backup/backup.sh /mnt/backup-esterno >> /var/log/spada-backup.log 2>&1
```

`infra/backup/backup.sh` è stato testato in isolamento (gare/ finte,
un piccolo spada.db) — verificare la prima esecuzione reale a mano
prima di fidarsi del cron.

## 8. Verifica finale (obbligatoria, dal piano)

```bash
env | grep -i ANTHROPIC_API_KEY   # deve essere VUOTO
claude /status                     # deve mostrare la subscription, non una API key
curl -s https://api.<tuo-dominio>/sistema/auth | python3 -m json.tool
```

`GET /sistema/auth` deve riportare `disponibile: true` e, se il token
si avvicina alla scadenza, `stima_scadenza` lo segnala (avviso anche
in UI, banner rosso/giallo in cima a `index.html` — Sprint 9.6). La
stima è approssimativa (basata sull'mtime di `auth.env`, non sul
token stesso): il valore esatto resta `claude /status`.

## 9. Sopravvivenza a un riavvio VM

- `spada-api`/`spada-worker`: `enable`d, ripartono da soli
  (`Restart=on-failure`).
- Il worker marca `errore` qualunque job trovato `in_esecuzione`
  all'avvio (Sprint 4) — nessuna ripresa automatica a metà, coerente
  con "ripartenza pulita" richiesta dal piano.
- `cloudflared` va installato come servizio di sistema
  (`cloudflared service install`), non lanciato a mano.
