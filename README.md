# Prometheus - S.P.A.D.A. — versione locale

Il sistema Prometheus - S.P.A.D.A. (analisi gare d'appalto e offerta
tecnica) in esecuzione **sul tuo computer**: stessa applicazione di
SPADA Online (interfaccia, backend, worker, pipeline di agenti), senza
VM, Cloudflare né dominio. Si apre nel browser su
<http://localhost:8000>.

Nasce come trasposizione di `SPADA-online` (branch `server-locale`):
il codice applicativo è lo stesso, cambia solo come gira.

## Uso

```bash
./spada setup      # una volta (e dopo ogni aggiornamento del codice)
./spada login      # una volta: autentica Claude per SPADA
./spada verifica   # facoltativo: prova reale e piccola con Claude
./spada avvia      # avvia e apre http://localhost:8000
./spada ferma      # spegne
```

Altri comandi: `./spada stato`, `./spada log`, `./spada riavvia`,
`./spada importa-prezzario <Regione> <anno> [cartella | file .dcf]`.

Requisiti: macOS, Claude Code (`claude`) con una subscription, Python
≥ 3.10 (es. `brew install python@3.12`), Node.js, `pdftotext`
(`brew install poppler`).

### Windows (WSL)

Funziona anche su Windows dentro Ubuntu (WSL), con gli stessi comandi.
Il codice va clonato nel filesystem Linux (`~/SPADA-online`, non sotto
`/mnt/c`: lì git non può impostare i permessi). Requisiti in Ubuntu:

```bash
sudo apt install -y nodejs npm poppler-utils sqlite3 python3-venv gh
```

Per chi non usa il terminale, `bash windows/installa.sh` (dopo
`./spada setup`) mette sul Desktop di Windows le icone **Avvia** e
**Ferma Prometheus - S.P.A.D.A.**: doppio clic, nessuna finestra di
comandi. Il login di Claude si fa dall'app (menu del profilo → Accedi a
Claude). Su macOS la cartella `windows/` non serve e non cambia nulla.

## Dove stanno le cose

```
questa cartella/      codice (app/, _pipeline/, spada)
~/spada/
├── gare/<slug>/      dati di ogni gara, ciascuna col proprio .git
├── _data/spada.db    database: prezzari + stato applicativo
├── _claude/          configurazione Claude Code dedicata a SPADA
├── _pipeline         → symlink a questa cartella/_pipeline
├── _venv/            ambiente Python del backend
├── _log/             api.log, worker.log
└── spada.env         porta e modalità permessi
```

## Prezzari

Stessa fonte della VM: le edizioni pubblicate come release in
`prometeus-prezzari`, importate in `~/spada/_data/spada.db` e
interrogate dagli agenti tramite il server MCP `prezzario`.
`./spada setup` importa da solo, una volta ciascuna, le edizioni della
cache locale (`~/.spada/prezzari/<Regione>/<anno>/`) e tutte le release
di `prometeus-prezzari` (serve `gh` autenticato). Le altre si importano
con `./spada importa-prezzario <Regione> <anno> [cartella con i JSON]`,
oppure direttamente dal file PriMus (ACCA) pubblicato dalla regione:
`./spada importa-prezzario Basilicata 2025 ~/Downloads/LisBasilicata_OOPP_2025.dcf`
(solo elenco prezzi; l'anno deve essere quello dichiarato nel file).

**Gara senza prezzario.** Se il prezzario della regione/anno della gara
non è presente, la gara si crea e si esegue lo stesso (in «Nuova gara»:
*Altra regione o anno*). Le fasi ricevono nel prompt l'indicazione di
saltare le valutazioni economiche (gap prezzi e capacità di
investimento nell'analisi strategica, prezzi delle voci nuove nel
computo metrico) e il pannello della gara mostra un avviso con il
pulsante **Importa ora**. Quando il prezzario arriva, l'avviso elenca le
elaborazioni fatte senza (`prezzario_version: null` in
`_state/run_log.json`) con il pulsante per rieseguirle.

## Cosa cambia rispetto alla VM

| VM (SPADA Online) | Locale |
|---|---|
| `spada-api` e `spada-worker` come servizi systemd | `./spada avvia` / `ferma`: stessi due processi, in background, log in `~/spada/_log` |
| Frontend su Cloudflare Pages, API dietro Cloudflare Tunnel | Un solo indirizzo: FastAPI serve anche il frontend su `localhost:8000` |
| Cloudflare Access come autenticazione | Il server ascolta solo su `127.0.0.1`: raggiungibile solo da questo computer |
| Pipeline collegata a `~/.claude` di un utente di sistema dedicato | Pipeline collegata a `~/spada/_claude` (`CLAUDE_CONFIG_DIR`): la tua configurazione `~/.claude` non viene toccata |
| Token in `/etc/spada/auth.env` | `./spada login` sulla config dedicata (o `CLAUDE_CODE_OAUTH_TOKEN` in `~/spada/_data/auth.env`) |
| `claude mcp add --scope user` | `~/spada/_claude/mcp-spada.json` con `--strict-mcp-config`: una fase vede solo il server `prezzario` |
| Script per bash 5 (Ubuntu) | Compatibili col bash 3.2 di macOS |
| Deploy automatico da GitHub Actions | Nessuno: `git pull` + `./spada setup` + `./spada riavvia` |

Altre differenze:

- **Permessi delle sessioni Claude.** Fasi, deliverable e intervento
  diretto girano con `--permission-mode auto` (configurabile in
  `~/spada/spada.env`): Claude Code approva da solo le azioni ordinarie
  e blocca quelle rischiose. Sul Mac personale, con documenti di gara
  non fidati in ingresso, è il compromesso giusto.
  `bypassPermissions` toglie ogni controllo, come sulla VM dedicata.
- **Mac acceso durante le fasi.** Ogni fase gira sotto `caffeinate -i`:
  il Mac non va in stop per inattività finché una fase è in corso.
  Chiudere il coperchio lo sospende comunque, e la fase va rilanciata.
- **Modelli.** La nuova gara propone gli alias `sonnet` e `opus`, che
  puntano sempre all'ultima versione disponibile. I manifest con
  `claude-sonnet-5` / `claude-opus-5` vengono convertiti da soli.
- **Effort.** L'effort scelto alla creazione della gara ora arriva
  davvero a `claude` (`--effort`); sulla VM restava solo nel manifest.

## Struttura del codice

```
_pipeline/    agenti, skill, comandi, script, hook — condivisi da ogni gara
  scripts/setup/spada_claude.sh   unico punto da cui si lancia `claude`
  scripts/setup/spada_comune.sh   funzioni condivise da fasi e deliverable
app/          backend FastAPI, worker, frontend statico
infra/backup/ backup di gare/ e spada.db
docs/         note degli sprint di SPADA Online
spada         comando di gestione locale
```

---

## Storia: SPADA Online

### Stato di avanzamento (versione VM)

| Sprint | Oggetto | Stato |
|---|---|---|
| 0 | Provisioning VM, accesso, hardening | ✅ fatto (Google Cloud VM, Tailscale, Cloudflare Tunnel/Access) |
| 1 | Pipeline condivisa (`_pipeline/`, symlink `~/.claude/`) | ✅ fatto |
| 2 | Prezzario in DB + server MCP | ✅ fatto |
| 3 | Fasi discrete, handoff, telemetria | ✅ fatto |
| 4 | Backend FastAPI | ✅ fatto |
| 5 | Design system | ✅ fatto |
| 6 | Frontend (prima versione) | ✅ fatto |
| 7 | Assistente di gara (sola lettura) | ✅ fatto |
| 8 | Ingestione incrementale | ✅ fatto |
| 9 | Deploy e messa in sicurezza | ✅ fatto — in produzione su `api.prometheus-spada.it` / `spada-online.pages.dev` |
| 10 | UI/UX avanzata + funzionalità emerse dal design (vedi sotto) | ✅ fatto |

**Sprint 1-9 sono in produzione**, non solo completati in questo repo:
VM Google Cloud con `spada-api`/`spada-worker` via systemd, Cloudflare
Tunnel per il backend, Cloudflare Pages per il frontend, Cloudflare
Access come unico livello di autenticazione (operatore singolo).

#### Sprint 10 — dettaglio

Nato dall'analisi di un prompt di design per l'interfaccia, che ha fatto
emergere funzionalità non solo di UI ma di sistema. Quattro sotto-sprint,
tutti conclusi e integrati in `main`:

| # | Oggetto | Stato |
|---|---|---|
| 10.1 | Ristrutturazione frontend: grafo visuale (nodi/archi, D3), dettaglio proposta su click, vista Impostazioni, vista dedicata per ciascuna delle 7 fasi (Acquisizione documenti, Estrazione requisiti, Analisi capitolato, Ricerca soluzioni, Revisione proposte, Deliverables, Audit e consegna) | ✅ fatto |
| 10.2 | Proposte suggerite dal professionista in "Ricerca soluzioni", ancorabili a un gap specifico, valutate da `criterion-agent`/`evidence-auditor` insieme a quelle generate dal sistema | ✅ fatto |
| 10.3 | Deliverables come workspace indipendenti: 5 tipi con agente dedicato (relazione tecnica, computo metrico, Legge 10, cronoprogramma, tavole tecniche) + fallback generico, ciascuno eseguibile/rieseguibile separatamente | ✅ fatto |
| 10.4 | Chat "Intervento diretto" a controllo pieno (lettura e scrittura), sempre disponibile nella vista Attività, scoped alla sola directory della gara — per interventi mirati fuori dal flusso a comandi rigido | ✅ fatto |

In corso d'opera il frontend è stato anche ricostruito su un nuovo
design system ("Liquid Glass": guscio persistente con barra applicativa,
stepper a 7 fasi, router ad hash `#/fase/n`, `#/attivita`,
`#/impostazioni`) — lavoro nato in parallelo su un'altra sessione e
integrato qui: la struttura visiva è quella del redesign, i quattro
punti che il redesign lasciava come placeholder ("non ancora esposto
dal backend") sono ora collegati agli endpoint reali di 10.2/10.3/10.4.

Automatizzato in questo sprint anche il **deploy continuo del
backend**: ogni push su `main` che tocca `app/backend/`, `app/worker/`
o `_pipeline/` aggiorna da solo la VM (`.github/workflows/deploy.yml`
+ `infra/deploy/deploy.sh`, via Tailscale + SSH) — richiede un setup
una tantum dei secrets del repository, vedi `infra/DEPLOY.md` §
"Deploy automatico (CI/CD)". Il frontend continua ad autodeployarsi
via Cloudflare Pages, invariato dallo Sprint 9.

**Cosa NON esiste ancora, esplicitamente**: agenti di verifica
incrociata tra deliverable diversi (es. il computo metrico non
controlla automaticamente la coerenza con la relazione Legge 10);
generazione di elaborati grafici CAD veri (il deliverable "tavole
tecniche" produce solo l'elenco e le note tecniche, non disegna); test
della chat "Intervento diretto" e degli agenti deliverable contro
l'API reale di Claude (verificati con shim, non con token OAuth vero,
stesso limite dichiarato per gli Sprint precedenti).

Dettaglio di ogni sprint nei rispettivi `README.md` di `_pipeline/` e
`app/`, e nel piano originale (non incluso qui: vive nella
conversazione/issue che ha originato il progetto).

## Piani

- App desktop macOS e Windows, login Google, gare sul cloud:
  `piani/2026-10-04-piano-app-desktop.md` (2026-10-04, proposto).
