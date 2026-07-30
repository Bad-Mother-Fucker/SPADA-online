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

## 6.5. Prezzario regionale

Senza almeno un'edizione importata il prezzario non è consultabile:
`GET /sistema/prezzari` risponde `[]`, i tool MCP falliscono e le fasi
che valorizzano le voci non hanno riferimento. (La gara si crea lo
stesso — regione e anno diventano campi liberi — ma dalla Fase 4 in poi
il prezzario serve.)

```bash
sudo -u spada bash /home/spada/spada/_pipeline/scripts/setup/import_prezzario.sh Campania 2026
```

Serve `gh` autenticato come utente `spada` (il repo dei prezzari è
privato). Lo script importa nello stesso `spada.db` di backend e server
MCP e verifica da sé che tabelle e indice full-text siano popolati.
Verifica finale: `curl -s https://api.<tuo-dominio>/sistema/prezzari`
deve elencare l'edizione.

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

## 8.5. Deploy automatico (CI/CD, Sprint 10)

Da questo sprint, ogni push su `main` che tocca `app/backend/`,
`app/worker/` o `_pipeline/` fa scattare `.github/workflows/deploy.yml`:
si collega alla VM via Tailscale + SSH ed esegue
`infra/deploy/deploy.sh` (`git reset --hard` al commit pushato,
aggiorna le dipendenze Python, riavvia `spada-api`/`spada-worker`).
Il frontend non passa da qui: Cloudflare Pages lo pubblica da solo ad
ogni push (nessuna azione qui, verifica solo che sia collegato al
branch `main`).

**Setup una tantum, non evitabile da remoto** (nessuna sessione di
sviluppo può creare credenziali Tailscale, chiavi SSH sulla VM o
secrets del repository al posto tuo):

1. **Chiave SSH dedicata al deploy** — sulla tua macchina, non sulla VM:
   ```bash
   ssh-keygen -t ed25519 -f deploy_key -N "" -C "spada-deploy-ci"
   ```
   Aggiungi `deploy_key.pub` a `~/.ssh/authorized_keys` dell'utente
   deploy sulla VM (lo stesso utente che già gestisce `spada-api`/
   `spada-worker`, es. `micheledes1296`).

2. **Sudoers scoped** per riavviare solo i due servizi, senza
   password e senza allargare i privilegi oltre il necessario — sulla
   VM:
   ```bash
   echo '<utente> ALL=(root) NOPASSWD: /usr/bin/systemctl daemon-reload, /usr/bin/systemctl restart spada-api, /usr/bin/systemctl restart spada-worker, /usr/bin/systemctl is-active spada-api spada-worker' \
     | sudo tee /etc/sudoers.d/spada-deploy
   sudo chmod 440 /etc/sudoers.d/spada-deploy
   ```

3. **Client OAuth Tailscale** (tailnet → Settings → OAuth clients):
   crea un client con tag `tag:ci` e permesso di generare nodi effimeri;
   annota client ID e secret. Verifica che la tua ACL Tailscale permetta
   a `tag:ci` di raggiungere la VM in SSH.

4. **Secrets del repository** (Settings → Secrets and variables →
   Actions):

   | Secret | Valore |
   |---|---|
   | `TS_OAUTH_CLIENT_ID` | dal punto 3 |
   | `TS_OAUTH_CLIENT_SECRET` | dal punto 3 |
   | `DEPLOY_SSH_KEY` | contenuto di `deploy_key` (la chiave **privata** generata al punto 1) |
   | `DEPLOY_HOST` | hostname Tailscale o IP `100.x.x.x` della VM |
   | `DEPLOY_USER` | utente deploy sulla VM |
   | `DEPLOY_PATH` | percorso assoluto del clone di questo repo sulla VM (es. `/home/micheledes1296/spada-online`) |

Dopo questo setup, ogni push successivo si deploya da solo — nessun
intervento manuale ricorrente. `workflow_dispatch` resta disponibile
per un deploy manuale on-demand dalla tab Actions di GitHub, se serve
forzarlo senza un nuovo push.

## 9. Sopravvivenza a un riavvio VM

- `spada-api`/`spada-worker`: `enable`d, ripartono da soli
  (`Restart=on-failure`).
- Il worker marca `errore` qualunque job trovato `in_esecuzione`
  all'avvio (Sprint 4) — nessuna ripresa automatica a metà, coerente
  con "ripartenza pulita" richiesta dal piano.
- `cloudflared` va installato come servizio di sistema
  (`cloudflared service install`), non lanciato a mano.
