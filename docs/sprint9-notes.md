# Sprint 9 — Deploy e messa in sicurezza

## Cosa è stato prodotto

- `infra/systemd/spada-api.service`, `spada-worker.service` — unit
  systemd con `EnvironmentFile=/etc/spada/auth.env`, `Restart=on-failure`,
  indurimento minimo (`NoNewPrivileges`, `ProtectHome`, path espliciti
  in scrittura).
- `infra/cloudflared/config.yml` — template di Tunnel, nessuna porta
  pubblica in ascolto.
- `infra/backup/backup.sh` — backup di `gare/`, `_data/spada.db`
  (via `sqlite3 .backup` o fallback Python `sqlite3.backup()` se il
  binario CLI non è disponibile) e dei tag/HEAD di `_pipeline/`.
- `infra/DEPLOY.md` — runbook completo, passo per passo, con la
  verifica finale esplicitamente richiesta dal piano
  (`ANTHROPIC_API_KEY` assente, `claude /status`, `GET /sistema/auth`).
- `GET /sistema/auth` esteso con una stima (non un valore certo) dei
  giorni alla scadenza del token OAuth, basata sull'mtime di
  `/etc/spada/auth.env`; il frontend (`index.html`) mostra un banner
  se mancano meno di 30 giorni (o se il token non è disponibile
  affatto).

## Perché "manuale" qui, a differenza degli sprint precedenti

Sprint 0 del piano è esplicitamente "da eseguire manualmente, non
delegabile a Claude Code": provisioning VM, hardening, token OAuth
reale. Sprint 9 dipende in modo diretto da quell'infrastruttura reale
(VM Oracle Cloud, account Cloudflare, DNS) che non esiste in questa
sessione di sviluppo. Ho prodotto tutti gli artefatti eseguibili
(unit systemd, script, config, runbook) e testato quanto è
verificabile senza infrastruttura reale:

- `backup.sh`: eseguito realmente contro una `gare/`/`spada.db` finti
  — produce gli archivi attesi, gestisce l'assenza di `sqlite3` CLI
  con il fallback Python (verificato: questo stesso sandbox non ha
  `sqlite3` CLI, il fallback si è attivato automaticamente).
- Stima scadenza token (`auth.py`): testata con un file finto e mtime
  forzato a 400 giorni fa → `giorni_alla_scadenza_stimata: -35`,
  coerente. Testata anche con `ANTHROPIC_API_KEY` presente → 
  `disponibile: false` con motivo esplicito.
- Banner in UI: verificato in Chromium headless reale (Playwright) —
  senza token disponibile, il banner rosso compare in `index.html`
  senza errori JS.
- Unit systemd: **non avviate realmente** (richiederebbero systemd e
  un utente `spada` reale, non presenti in questo sandbox) — solo
  scritte e rilette per coerenza sintattica/di percorso con quanto
  già verificato negli sprint precedenti (percorsi `SPADA_GARE_DIR`
  ecc. coerenti con `paths.py`).

## Non ancora fatto (richiede infrastruttura reale, fuori portata di questa sessione)

- Provisioning VM Oracle Cloud, hardening, Tailscale (Sprint 0 —
  esplicitamente manuale anche nel piano originale).
- Registrazione dominio/DNS, creazione Tunnel reale, policy Cloudflare
  Access.
- Deploy reale del frontend su Cloudflare Pages.
- Avvio reale di `spada-api`/`spada-worker` via systemd e verifica di
  sopravvivenza a un riavvio VM.
- Prima esecuzione reale di `backup.sh` in cron e verifica che il
  backup sia effettivamente ripristinabile (non solo "prodotto").

Questi punti restano interamente nelle mani dell'operatore: gli
artefatti sono pronti, l'esecuzione richiede credenziali e accesso
che questa sessione di sviluppo non ha e non dovrebbe avere.
