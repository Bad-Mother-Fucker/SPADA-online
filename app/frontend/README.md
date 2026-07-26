# `app/frontend/` — SPADA Online (Sprint 6)

Statico, senza build step (deployabile su Cloudflare Pages così com'è):

```
frontend/
├── index.html    elenco gare + creazione
├── gara.html     pagina gara: fasi, agenti, output, approvazioni, upload
├── css/app.css   layout — usa i token di design-system.css (Sprint 5)
└── js/
    ├── config.js   window.SPADA_API_BASE — unico punto da cambiare per ambiente
    ├── api.js      client fetch per il backend FastAPI
    ├── elenco.js   logica index.html
    └── gara.js     logica gara.html (SSE, fasi, agenti, approvazioni, upload)
```

Il design system (Sprint 5) non è incluso come file statico nel bundle:
viene richiesto in runtime a `GET {SPADA_API_BASE}/sistema/design-system.css`
— stessa fonte usata da `md_to_html.js` per gli output di gara, niente
copie che possono divergere.

## Sviluppo locale

```bash
# terminale 1 — backend (vedi app/backend/README implicito in app/README.md)
cd ../backend && uvicorn main:app --port 8000

# terminale 2 — frontend
cd . && python3 -m http.server 8124
```

Poi apri `http://localhost:8124/index.html` con
`window.SPADA_API_BASE = "http://localhost:8000"` (impostalo in
`js/config.js` per lo sviluppo locale, o via `?api=` se preferisci
aggiungere quel parsing — non incluso per restare minimale).

## Cosa implementa, in breve

- **Elenco gare**: stato leggibile (fase corrente + stato), creazione
  con form (slug, nome, regione/anno prezzario, modello, effort).
- **Pagina gara**: intestazione, sintesi in linguaggio naturale,
  barra delle 7 fasi, card di fase con azione (Esegui/Riesegui/Approva
  a seconda dello stato), vista agenti adattiva (l'etichetta
  dell'unità di lavoro cambia con la fase corrente), sezione
  "Elaborati prodotti" (preferisce il gemello HTML in `11_view/`
  quando esiste), storico esecuzioni, upload documenti (centrale prima
  dell'avvio, spostato in fondo dopo — Sprint 6.3), log grezzo in
  `<details>` secondario.
- **Fase 5 — revisione proposte**: sezione dedicata separata dal gate
  generico delle fasi 3/7, con una riga per proposta (parsing minimale
  della tabella di `output/06_registers/proposal_register.md`) e tre
  azioni per riga (Approva / Da modificare / Scarta) più nota libera,
  ciascuna che registra una `POST /gare/{slug}/approvazioni` separata.
- **SSE**: `EventSource` su `/gare/{slug}/stream` aggiorna barra fasi,
  card fasi e vista agenti senza ricaricare la pagina.

## Verifica eseguita in questa sessione

Backend e frontend avviati realmente (non solo letti) e la pagina è
stata caricata in **Chromium headless reale** (Playwright, browser
pre-installato dell'ambiente) con un test che:
- carica `index.html`, verifica titolo e versione pipeline mostrata
- compila il form e crea una gara reale via API
- verifica che la card appaia nell'elenco
- apre `gara.html?slug=...`, verifica intestazione, barra fasi (7
  step), 7 phase-card renderizzate
- clicca "Esegui" sulla fase 1 (accoda un job reale sul backend)
- verifica che output/run-log vuoti non producano errori

Due difetti trovati e corretti grazie a questo test, non dalla sola
lettura del codice:
1. L'attributo HTML `pattern="[a-z0-9-]{1,64}"` sull'input slug
   generava un errore JS reale in Chrome (il motore di validazione
   pattern in modalità *unicode sets* tratta `-` non escappato in
   fondo alla classe come carattere non valido in certe posizioni) —
   corretto in `[a-z0-9\-]{1,64}`.
2. Un 404 di rete era presente in console: verificato con `curl`
   trattarsi della richiesta automatica del browser per
   `favicon.ico` (non definito, benigno) — non un difetto applicativo.

## Non ancora fatto

- Nessuna vera esecuzione di fase osservata end-to-end nel browser
  (il job resta `in_coda` finché un worker con autenticazione Claude
  reale non lo consuma — coerente con non spendere token/costo reale
  senza autorizzazione esplicita, stesso limite di Sprint 4).
- Il parsing della tabella proposte è testuale e minimale (regex sulle
  celle `|`): sufficiente per il formato fisso documentato in
  `criterion-agent.md`/`evidence-auditor.md`, ma fragile a variazioni
  di formattazione — un endpoint `GET /gare/{slug}/proposte`
  strutturato (JSON) sarebbe più robusto, non implementato in questo
  sprint per restare dentro lo scope del piano (che non lo elenca tra
  gli endpoint Sprint 4).
- Nessun toggle di tema chiaro/scuro nell'UI (il CSS supporta
  `data-theme` e `prefers-color-scheme`, manca solo il controllo).
