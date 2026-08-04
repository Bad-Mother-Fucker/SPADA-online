# `app/frontend/` — SPADA Online

Statico, senza build step (deployabile su Cloudflare Pages così com'è):

```
frontend/
├── index.html        elenco gare + modale "nuova gara"
├── gara.html         guscio della pagina gara (barra, testata, stepper, viste)
├── css/
│   ├── tokens.css    design tokens "Liquid Glass" — unica fonte di colore,
│   │                 tipografia, spaziatura, motion, temi chiaro/scuro
│   └── app.css       componenti: nessun valore letterale, solo token
└── js/
    ├── config.js     window.SPADA_API_BASE — unico punto da cambiare per ambiente
    ├── ui.js         costruzione DOM (h/s/set), icone SVG, tema, toast, formati
    ├── dominio.js    vocabolario condiviso: le 7 fasi, gli stati, le categorie
    ├── md.js         lettura dei registri markdown prodotti dalla pipeline
    ├── api.js        client fetch del backend FastAPI (errori con stato e percorso)
    ├── elenco.js     logica di index.html
    ├── viste.js      renderer delle viste di gara (non fanno fetch)
    └── gara.js       guscio di gara.html: router, SSE, dati, azioni, assistente
```

Il DOM si costruisce con `UI.h()`, mai con `innerHTML`: nomi di gara,
messaggi e contenuti dei registri arrivano da file caricati dall'operatore
e non vanno mai interpretati come markup.

## Design

L'interfaccia implementa il progetto Claude Design **«Design system e
pagina gara»**. `css/tokens.css` è copia fedele di `spada-tokens.css` di
quel progetto; `css/app.css` traduce in classi gli stili che il progetto
esprime inline.

Il design system della pipeline (`_pipeline/design/design-system.css`,
servito da `GET /sistema/design-system.css`) resta invariato e continua a
servire i documenti HTML generati: le sue classi (`.phase-card`,
`.agent-row`, `.badge`) sono usate da quegli output, non dall'app, che
ora ha il proprio foglio. Le due cose non vengono più caricate insieme.

## Struttura di navigazione

Un solo guscio persistente, che non si ricarica mai; cambia solo l'area
centrale. Ogni vista ha una URL propria, quindi è linkabile e sta nella
cronologia:

| URL | Vista |
|---|---|
| `#/fase/N` | una delle 7 fasi |
| `#/fase/5/proposta/P-07` | dettaglio di una proposta |
| `#/fase/6/deliverable/D-01` | workspace di un deliverable |
| `#/grafo/<tipo>` | grafo di tracciabilità, filtrato per tipo di nodo |
| `#/attivita` | storico esecuzioni, agenti, log grezzo |
| `#/impostazioni` | parametri di gara e di sistema, separati |

Due assi distinti, quindi due controlli distinti: lo **stepper** governa
*dove sei nel processo*, le **viste trasversali** in barra governano *cosa
stai guardando della gara*.

Lo stream SSE è aperto **una volta dal guscio**, non dalle viste:
cambiare fase non riapre la connessione e non perde eventi. Alla caduta
riprova con backoff 2→30 s e le righe di agente si desaturano, così
«fermo» si distingue da «non più aggiornato».

## Da dove vengono i dati

Dove il backend espone un endpoint strutturato la vista usa quello; il
parsing dei registri markdown resta solo dove un endpoint non c'è. Un
`404` non è un errore: significa "quella fase non l'ha ancora prodotto",
ed è uno stato previsto. L'elenco di `GET /output` è noto in anticipo,
quindi i file assenti non vengono nemmeno richiesti.

| Vista | Fonte |
|---|---|
| Fase 1 · acquisizione | `GET /gare/{slug}/documenti` |
| Fase 2 · requisiti | `03_criteria/criteria_matrix.md`, poi `criteria_checklist.md` |
| Fase 3 · analisi | `03_criteria/gara_brief.md`, poi `strategy_audit.md` |
| Fase 4 · gap | `06_registers/gap_register.md` |
| Fase 4 · proposte del professionista | `GET`/`POST /gare/{slug}/proposte-operatore` |
| Fase 5 · elenco proposte | `06_registers/proposal_register.md` |
| Fase 5 · dettaglio proposta | `GET /gare/{slug}/proposte/{id}` (nodo del grafo) |
| Fase 6 · deliverable | `GET /gare/{slug}/deliverables` + `…/esegui`, `…/riesegui` |
| Fase 7 · audit | `06_registers/audit_summary.md` |
| Grafo | `GET /gare/{slug}/grafo` (nodi e archi reali), più gap e deliverable |
| Attività · storico | `GET /run-log` + `_state/attivita.json` via SSE |
| Attività · Claude Code | `GET`/`POST /gare/{slug}/interventi` |
| Impostazioni | `manifest.json` + `/sistema/{auth,pipeline,prezzari}` |

Il parsing dei registri (`md.js`) cerca le colonne **per sinonimi**, non
per posizione: gli agenti variano la forma delle intestazioni, non il
significato. Se una tabella non si riconosce, la vista mostra lo stato
"non ancora prodotto" invece di rendere una griglia vuota.

### Grafo

Le colonne del design (documenti, requisiti, gap, proposte, deliverable)
non coincidono con i tipi del knowledge graph. La mappa sta in
`viste.js → COLONNA_PER_TIPO`; ciò che non rientra finisce in «Altri
nodi» invece di sparire, perché un nodo che il grafo contiene e la vista
non mostra sarebbe una bugia sulla tracciabilità. Gli **archi sono quelli
veri**: si tracciano dopo il layout misurando i nodi effettivamente resi.

### Le due chat, e perché sono separate

- **Assistente** (pannello flottante, ogni vista): sola lettura, contesto
  l'intera gara, attivo dalla Fase 2 — prima non avrebbe su cosa
  rispondere, ed è lo stesso vincolo che applica il backend.
- **Claude Code** (dentro Attività): legge *e scrive*. Sta accanto al
  registro di ciò che ha scritto, non altrove. Il backend rifiuta con
  `409` se una fase è in esecuzione, e l'interfaccia riporta il motivo.

## Sviluppo locale

```bash
# terminale 1 — backend
cd ../backend && uvicorn main:app --port 8000

# terminale 2 — frontend
python3 -m http.server 8124
```

Poi imposta `window.SPADA_API_BASE = "http://localhost:8000"` in
`js/config.js` e apri `http://localhost:8124/index.html`.

## Limiti noti

- **Impostazioni di gara** sono in sola lettura: `manifest.json` è scritto
  dalla pipeline e il backend non espone una modifica. Archiviazione e
  duplicazione sono presenti e disabilitate per lo stesso motivo.
- Il badge di connessione nell'elenco riporta la **raggiungibilità del
  backend**, non uno stream: l'elenco non ne apre uno.
- Su un backend precedente allo Sprint 10 gli endpoint strutturati non
  esistono: le viste che li usano mostrano lo stato vuoto invece di un
  errore, ma restano prive di contenuto finché il backend non è aggiornato.
