# SPADA Online

Ricostruzione da zero, in repository nuovi, del sistema Prometeus
S.P.A.D.A. (analisi gare d'appalto e offerta tecnica) come applicazione
web con UI, backend e pipeline condivisa — invece del modello a
template clonato per gara del repo storico `prometeus-spada`.

**`prometeus-spada` resta la sola fonte di riferimento, in sola
lettura.** Non viene mai modificato, non riceve branch né commit da
questo progetto: si legge e si copia da lì, adattando. Vedi
`docs/sprint1-inventario.md` per la mappa completa di cosa è stato
portato e come.

## Struttura di questo repo

```
SPADA-online/
├── _pipeline/    agenti, skill, comandi, script, hook — condivisi da ogni gara (Sprint 1-3, 10.3)
├── app/          backend FastAPI, worker, frontend (Sprint 4-10)
├── infra/        artefatti di deploy: systemd, tunnel, runbook, deploy CI/CD (Sprint 9-10)
├── .github/      workflow di deploy automatico (Sprint 10)
└── docs/         inventario, decisioni, schemi
```

Le gare vere e proprie (dati, mai codice) vivono fuori da questo repo,
in `~/spada/gare/<slug>/`, ciascuna con il proprio `.git` — vedi
struttura target nel piano e `_pipeline/scripts/setup/new_gara.sh`.

## Stato di avanzamento

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
| 10 | UI/UX avanzata + funzionalità emerse dal design (vedi sotto) | 🟡 in corso |

**Sprint 1-9 sono in produzione**, non solo completati in questo repo:
VM Google Cloud con `spada-api`/`spada-worker` via systemd, Cloudflare
Tunnel per il backend, Cloudflare Pages per il frontend, Cloudflare
Access come unico livello di autenticazione (operatore singolo).

### Sprint 10 — dettaglio

Nato dall'analisi di un prompt di design per l'interfaccia, che ha fatto
emergere funzionalità non solo di UI ma di sistema. Quattro sotto-sprint:

| # | Oggetto | Stato |
|---|---|---|
| 10.1 | Ristrutturazione frontend: grafo visuale (nodi/archi, D3), dettaglio proposta su click, sezione impostazioni, vista dedicata per ciascuna delle 7 fasi (Acquisizione documenti, Estrazione requisiti, Analisi capitolato, Ricerca soluzioni, Revisione proposte, Deliverables, Audit e consegna) | ✅ fatto |
| 10.2 | Proposte suggerite dal professionista in "Ricerca soluzioni", ancorabili a un gap specifico, valutate da `criterion-agent`/`evidence-auditor` insieme a quelle generate dal sistema | ✅ fatto |
| 10.3 | Deliverables come workspace indipendenti: 5 tipi con agente dedicato (relazione tecnica, computo metrico, Legge 10, cronoprogramma, tavole tecniche) + fallback generico, ciascuno eseguibile/rieseguibile separatamente | ✅ fatto |
| 10.4 | Chat "Intervento diretto" a controllo pieno (lettura e scrittura), sempre disponibile nella pagina gara, scoped alla sola directory della gara — per interventi mirati fuori dal flusso a comandi rigido | ✅ fatto |

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
