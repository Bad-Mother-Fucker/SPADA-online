# Sprint 2 — Prezzario in database e server MCP

## Cosa cambia

Il prezzario regionale passa da indice JSON caricato in cache locale
(skill `prezzario` + `fetch_prezzario.sh` di `_riferimento/`, entrambi
non portati) a dato interrogabile in `_data/spada.db` (SQLite+FTS5),
via server MCP `_pipeline/mcp/prezzario/`. Dettaglio in
`_pipeline/mcp/prezzario/README.md`.

## Adattamenti agli agenti esistenti

- `strategy-auditor` (agente): prerequisiti aggiornati (`manifest.json`
  invece di `PROJECT_CONFIG.json` per regione/anno), tool MCP aggiunti
  al frontmatter `tools:`.
- `skills/strategy-audit/SKILL.md`, Analisi 2 (gap prezzi): la
  procedura di lookup per codice tariffa ora passa da
  `confronta_prezzo()` invece che da lookup manuale su JSON; le soglie
  di classificazione (BASSO/MEDIO/ALTO) restano identiche e sono
  applicate una volta dal server (per voce) e una volta dall'agente
  (sulla media del campione) — stesso valore, due punti di calcolo
  indipendenti per coerenza.
- `criterion-agent`: non usava direttamente il prezzario nel repo di
  riferimento (solo tramite strategy-auditor a monte); nessun
  adattamento necessario oltre alla rinomina percorsi (vedi sotto).

## Correzione retroattiva a Sprint 1: convenzioni di percorso

Lavorando su Sprint 2 è emerso un disallineamento nel lavoro di
Sprint 1: la struttura dati target del piano usa `input/`, `output/`,
`_state/`, `manifest.json` (non `00_input/`, `03_criteria/` a radice,
`08_state/`, `PROJECT_CONFIG.json` del modello precedente). `new_gara.sh`
(Sprint 1.4) già creava la struttura nuova, ma gli agenti/skill/comandi
portati in Sprint 1 citavano ancora i vecchi percorsi nel testo dei
prompt — copiati "così com'è" assumendo (erroneamente) che i soli
percorsi invarianti fossero sufficienti. Corretto in questo sprint con
una sostituzione sistematica su tutti gli agenti/skill/comandi:

| Vecchio | Nuovo |
|---|---|
| `PROJECT_CONFIG.json` | `manifest.json` |
| `00_input/` | `input/` |
| `01_extracted/` | `output/01_extracted/` |
| `03_criteria/` | `output/03_criteria/` |
| `04_doc_summaries/` | `output/04_doc_summaries/` |
| `05_criteria_outputs/` | `output/05_criteria_outputs/` |
| `06_registers/` | `output/06_registers/` |
| `07_questions/` | `output/07_questions/` |
| `08_state/` | `_state/` |
| `10_offer/` | `output/10_offer/` |
| `11_view/` | `output/11_view/` |

`02_graph/` non cambia: resta alla radice della gara per esplicita
indicazione della struttura target del piano.

Aggiunto anche il campo `deliverables` a
`_pipeline/schemas/manifest.schema.json` (mancava: `disciplinare-analyst`
lo scrive in `manifest.json` e `offer-writer` lo legge, riferimento
preesistente in `_riferimento/CLAUDE.md` §3 non colto nella prima
stesura dello schema).

Verifica: rieseguiti `link_pipeline.sh` + `new_gara.sh` dopo tutte le
modifiche, i tre JSON di stato validano ancora contro i rispettivi
schemi; nessuna occorrenza residua dei vecchi percorsi in
`_pipeline/agents|comandi|skills` (verificato con grep mirato).

## Limiti noti di questo sprint

- ~~Import reale non eseguito.~~ **Chiuso**: `campania-2026` è stata
  scaricata da `prometeus-prezzari` e importata davvero — 31.755
  articoli, 37.830 sotto-gruppi validati senza mismatch, 71.544 voci
  elementari. La validazione bloccante dei subtotali passa sul dato
  vero, non solo sul fixture, e i quattro tool MCP sono stati
  interrogati sul database risultante. Il passo è ora un comando solo:
  `_pipeline/scripts/setup/import_prezzario.sh <Regione> <anno>`.
- Non è stata verificata l'identità aritmetica tra `prezzo_base` di un
  articolo e la somma dei sotto-gruppi della sua Analisi (se dovrebbe
  coincidere è un'assunzione che richiede conferma sul dato reale, non
  sul fixture): il controllo bloccante implementato è solo quello
  esplicitamente richiesto dal piano (subtotali dei sotto-gruppi
  dell'Analisi), non esteso per non introdurre un vincolo non
  verificato come se fosse un requisito noto.
