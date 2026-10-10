# `app/` — backend, worker, frontend (Sprint 4+)

```
app/
├── backend/     FastAPI (Sprint 4)
├── worker/      consumer coda FIFO, un job alla volta (Sprint 4)
└── web/         interfaccia web: Vite + React + shadcn/ui, compilata in
                 web/dist e servita da FastAPI su "/"
```

Le regole del design stanno in `DESIGN.md` nella radice; come si lavora
sull'interfaccia è in `web/README.md`.

## Backend

In locale si avvia con `./spada avvia` dalla radice del progetto, che
lancia l'equivalente di:

```bash
cd backend
export SPADA_HOME=~/spada   # gare/, _data/, _claude/, _pipeline
~/spada/_venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

L'interfaccia è su `/` (stessa origine dell'API, niente CORS); lo
stato del servizio su `/salute`. In sviluppo l'interfaccia gira anche
da sola con `cd app/web && npm run dev` su http://localhost:5173,
con proxy verso il backend su :8000.

Schema applicativo (`gare`, `job`, `documenti`, `approvazioni`,
`conversazioni`) applicato automaticamente all'avvio in
`_data/spada.db` — lo stesso database del prezzario (Sprint 2), non un
file separato.

Endpoint implementati: `GET/POST /gare`, `GET /gare/{slug}`,
`POST /gare/{slug}/documenti`, `POST /gare/{slug}/fasi/{n}/{esegui|riesegui|approva}`,
`GET /gare/{slug}/stream` (SSE), `GET /gare/{slug}/output[/{percorso}]`,
`GET /gare/{slug}/run-log`, `POST /gare/{slug}/approvazioni`,
`GET /sistema/{auth,prezzari,pipeline}`.

Aggiunti dopo:

- `POST /sistema/prezzari/carica` — prezzario da file PriMus (.dcf).
- `POST /gare/{slug}/job/{id}/interrompi` — «Interrompi» una fase o un
  deliverable. In coda: il job diventa `annullato`. In esecuzione: l'API
  segna `job.interruzione_richiesta`, il worker termina il gruppo di
  processi con SIGTERM entro 2 secondi, lo script registra il run
  `interrotto` e la fase/il deliverable `interrotta`. Ogni run è una
  sessione di Claude Code con id = run_id: rieseguirla con `esegui`
  riprende quella sessione (`claude --resume`) e continua da dove si era
  fermata; `riesegui` riparte da capo. Lo stesso vale se SPADA viene
  fermato durante un'esecuzione.
- `POST /gare/{slug}/assistente/stream` — risposta dell'assistente in
  streaming (NDJSON), modalità `rapida` o `approfondita`. Gli eventi
  `stato` vengono dagli strumenti che l'assistente usa davvero; il
  ragionamento interno del modello non viene inoltrato.
- `GET /gare/{slug}/deliverables` porta anche lo stato della coda
  (`in_coda`, `in_esecuzione`, `job.interruzione_richiesta`).

`POST /gare/{slug}/assistente` risponde `501`: il contratto dati è
pronto (persiste il messaggio in `conversazioni`), l'esecuzione read-only
via `claude -p` è Sprint 7.

## Worker

```bash
cd worker
python3 worker.py
```

Processo separato dall'API per costruzione (principio: un solo run
alla volta, **globale**, non per-gara — il worker verifica che nessun
job sia `in_esecuzione` prima di prelevarne uno nuovo, qualunque gara).
All'avvio marca `errore` ogni job trovato `in_esecuzione` (residuo di
un crash o riavvio precedente): mai ripreso a metà automaticamente.
Un job interrotto («Interrompi», o worker fermato con SIGTERM) invece si
riprende da dove era quando l'operatore lo riesegue.

## Livello di autenticazione Claude (`backend/auth.py`)

Unico punto che worker/API conoscono: `get_claude_env()`. Versione
locale: usa `CLAUDE_CODE_OAUTH_TOKEN` (ambiente o
`~/spada/_data/auth.env`) se c'è, altrimenti il login della
configurazione Claude dedicata (`./spada login`, verificato con
`claude auth status`). Solleva esplicitamente se manca — un job non
parte mai senza autenticazione verificata. `ANTHROPIC_API_KEY` non
blocca più: `spada_claude.sh` la toglie dall'ambiente di ogni
invocazione, così si usa sempre la subscription.

## Validazione percorsi (`backend/paths.py`)

Ogni slug è validato con `^[a-z0-9-]{1,64}$` e ogni percorso derivato è
verificato restare sotto `SPADA_GARE_DIR` prima di essere letto o
scritto. Il nome file di upload viene ridotto al solo basename
(`Path(...).name`), scartando ogni componente di percorso anche se il
client lo manda malevolo.

## Verifica eseguita in questa sessione

Backend e worker sono stati avviati realmente (non solo letti) in un
ambiente di test isolato (`uvicorn` su porta locale, venv dedicato) e
interrogati con richieste HTTP reali:

- creazione gara → invoca `new_gara.sh` reale, verificato l'output su
  disco e nella tabella `gare`
- upload documento, incluso un tentativo di path traversal nel nome
  file (`../../../../etc/passwd`) → il file finisce sanificato come
  `passwd` dentro `input/elaborati/`, mai fuori dalla gara
- path traversal nell'URL (`/gare/../../../etc/passwd`) → 404, non
  raggiunge mai il filesystem
- slug non valido in creazione → 422 con messaggio esplicito
- gara inesistente → 404
- coda job: accodamento, consumo FIFO, un solo job in_esecuzione alla
  volta
- worker: fallimento esplicito per assenza di `CLAUDE_CODE_OAUTH_TOKEN`
  (nessuna invocazione `claude` reale eseguita — coerente con non
  spendere token/costo reale senza autorizzazione esplicita)
- worker: job orfano `in_esecuzione` all'avvio → marcato `errore`,
  nessuna ripresa automatica
- SSE (`/gare/{slug}/stream`) → evento ricevuto correttamente

## Non ancora fatto

- Nessuna esecuzione reale di `spada-fase` dal worker in questa
  sessione (richiede token OAuth reale + costo API — non eseguito
  senza autorizzazione esplicita). La chiamata è cablata e il percorso
  di errore è verificato; il percorso di successo va verificato sulla
  VM con autenticazione reale.
- Autenticazione utente/HTTP sull'API stessa: nessuna in questo
  sprint — il piano la demanda a Cloudflare Access davanti
  all'intero backend (Sprint 9), non a un livello applicativo separato.
