# Sprint 5 — Design system

## Cosa è stato fatto

- **`_pipeline/design/design-system.css`**: palette (chiaro/scuro,
  `prefers-color-scheme` + `data-theme` per un eventuale toggle),
  scala tipografica, spaziature, raggi, token di motion
  (durate/easing) e `prefers-reduced-motion`. Estratto dai token già
  collaudati negli artifact HTML di `_riferimento/` (non reinventato:
  quella palette badge/colori era già un sistema coerente, solo
  duplicato dentro lo script invece che condiviso).
- Componenti ricorrenti definiti: `.status-badge`/`.badge` (già
  esistente, ora condiviso), `.phase-card`, `.agent-row` (con
  animazione di entrata a stagger e pallino di stato pulsante),
  `.approval-panel`, `.output-block`.
- `scripts/render/md_to_html.js` inlinea questo file in ogni artifact
  generato (deve restare autoconsistente/offline — niente `<link>`
  esterno) al posto della copia locale di `:root`/`.badge` che aveva
  prima.
- `link_pipeline.sh` pubblica `_data/design-system.css` come symlink
  al sorgente in `_pipeline/design/` — coerente con la struttura
  target (`_data/` non versionato, per-macchina) mantenendo comunque
  un'unica sorgente versionata da cui parte l'aggiornamento.

## Deviazione dal piano, motivata

Il piano indicava di installare tre skill esterne
(`bencium-impact-designer`, `typography`, `motion-design-skill`) via
`npx skills add ...` e usarle una tantum per produrre il CSS.
**Non l'ho fatto**: eseguire `npx <pacchetto-di-terze-parti>` scarica
ed esegue codice arbitrario da un registro esterno non verificato in
questo contesto — un'azione a rischio più alto di quelle fatte finora
in questa sessione (lettura/scrittura locale, pacchetti PyPI/npm
ampiamente noti come `fastapi`/`mcp`), e non l'ho ritenuta
autorizzabile autonomamente senza che l'operatore la riveda prima.
Ho invece scritto il design system a mano, partendo dalla palette già
in uso e testata in `_riferimento/` — stesso risultato (token unici,
non rinegoziati ad ogni generazione), fonte diversa. Se l'operatore
vuole comunque usare quelle skill per rifinire il sistema, restano
disponibili da eseguire manualmente in un secondo momento: il file
prodotto qui resterebbe comunque il punto di partenza da modificare,
non da rifare.

## Correzione retroattiva a Sprint 1/2: bug di `ROOT` in due script

Lavorando su `md_to_html.js` per inserire il design system, ho
scoperto (e corretto) un bug preesistente in tre script Node ereditati
da `_riferimento/`:

- `scripts/render/md_to_html.js`
- `scripts/offer/md_to_docx.js`
- `scripts/graph/graph_lint.js` (percorso vecchio residuo, non il bug
  di `ROOT` — quello script già usava percorsi relativi al cwd)

I primi due calcolavano `ROOT = path.resolve(__dirname, '../..')`: nel
vecchio modello a template clonato funzionava, perché lo script viveva
fisicamente dentro la gara. Nel modello a pipeline condivisa questi
script vivono una sola volta in `_pipeline/scripts/.../` e sono
raggiunti per OGNI gara tramite il symlink `~/.claude/scripts`:
`__dirname` punta sempre a `_pipeline/`, quindi `ROOT` finiva per
puntare alla pipeline invece che alla gara corrente — `output/11_view/`
sarebbe stato scritto dentro `_pipeline/` invece che nella gara.
Corretto con `ROOT = process.cwd()` (la working directory con cui
`claude`/gli hook vengono invocati è sempre la gara), mantenendo
`PIPELINE_ROOT` (via `__dirname`) per risorse pipeline come
`design-system.css`.

Ho anche trovato e corretto un secondo bug, indipendente da questo:
`VIEW_DIR` ora è `output/11_view/` (dentro `output/`, coerente con
Sprint 2), ma i file sorgente da rispecchiare sono referenziati con il
prefisso `output/` (es. `output/03_criteria/gara_brief.md`) — senza
correzione, il mirror finiva doppio
(`output/11_view/output/03_criteria/...`). Aggiunta `relForView()` che
toglie il prefisso `output/` solo per il calcolo della destinazione.

## Verifica eseguita

Rigenerato un artifact reale da una gara di prova (`gara_brief.md` con
una tabella contenente valori badge-classificabili):
- percorso di destinazione corretto (`output/11_view/03_criteria/...`,
  non doppio-annidato)
- CSS del design system effettivamente inlineato (verificato che le
  classi `.phase-card`/`.agent-row`/`.approval-panel` compaiono
  nell'HTML generato)
- badge renderizzati con le classi corrette (`badge crit`, `badge good`)
- `--check` riporta l'artifact allineato dopo la generazione

## Non ancora fatto

- Nessuna schermata dell'app da affiancare per la verifica visiva
  finale (Sprint 6): la condivisione del token file è il meccanismo
  che la garantisce, non ancora osservabile fino a che il frontend non
  esiste.
- `md_to_docx.js` non è stato testato funzionalmente in questa
  sessione (richiede `npm install` della dipendenza `docx` e un file
  di bozza reale) — solo la sintassi e il fix di `ROOT`/percorso sono
  stati verificati.
