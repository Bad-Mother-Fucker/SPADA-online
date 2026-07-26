# Command — Start bid analysis

## Chi orchestra

Il **main loop** (guidato da CLAUDE.md §3 Fase 1), non un agente
orchestratore. Gli agenti Claude Code non possono invocarne altri: la
sequenza qui sotto è una catena di invocazioni dirette dal main loop.

## Quando usarlo

All'avvio di un nuovo progetto gara, quando i documenti sono stati inseriti in `input/`.

## Cosa fa automaticamente

Il main loop invoca in sequenza, senza richiedere input:

1. `document-preprocessor` — censisce file, gestisce .p7m, estrae testo
2. `disciplinare-analyst` — estrae criteri dal disciplinare (numero dinamico)
   e produce `output/03_criteria/gara_brief.md`
3. `graph-builder` — costruisce il knowledge graph (`02_graph/`).
   **Non è una singola invocazione**: il main loop lo invoca 8 volte —
   una per le Fasi 0-2 (cartelle, elenco elaborati, censimento,
   estrazione testi), poi le Fasi A, B, C in parallelo (round 1), poi
   le Fasi D, E, F in parallelo (round 2), poi una finale per le
   Fasi 4-5 (rebuild index.md, log, lint, report).
   Dettaglio in CLAUDE.md §3 Fase 1 Step 3.
4. `strategy-auditor` — produce l'audit strategico (`output/03_criteria/strategy_audit.md`)

## STOP

Al termine ci sono **due** STOP obbligatori in sequenza, nel formato
esatto di CLAUDE.md §3 Fase 1:

1. **Feedback sull'audit strategico** — riporta parola per parola la
   tabella "Riepilogo" e le "Domande chiave" da
   `output/03_criteria/strategy_audit.md`, e attende la risposta del
   professionista. Le risposte vanno scritte nella sezione
   "Indicazioni strategiche del professionista" dello stesso file.
2. **Scelta criteri** — solo dopo il feedback strategico, presenta il
   menu (Analizza C1 / C1 e C3 / tutti / scelta manuale) e attende.

Non mostrare il menu criteri prima di aver ricevuto il feedback
strategico.

## Output fase automatica

- `input/_manifest_input.md`
- `output/01_extracted/extraction_log.md`
- `output/03_criteria/criteria_matrix.md`
- `output/03_criteria/criteria_matrix.json`
- `output/03_criteria/criteria_checklist.md`
- `output/03_criteria/criteria/criterion_Cx.md` (uno per criterio reale)
- `output/03_criteria/gara_brief.md`
- `02_graph/index.md`
- `02_graph/scope.md`
- `02_graph/economic_framework.md`
- `output/03_criteria/strategy_audit.md`
- `_state/project_state_snapshot.md` (snapshot iniziale via `context-monitor`)
- `output/11_view/**.html` — artifact leggibili, generati in automatico dall'hook
  di rendering a ogni scrittura (vedi CLAUDE.md §6.1)
