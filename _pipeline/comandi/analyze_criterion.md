---
argument-hint: <criterio, es. C1>
description: Analizza un singolo criterio: letture documenti, evidenze, gap, proposte, domande guida, audit.
---

# Command — Analyze criterion

## Argomento

Criterio da analizzare: `$ARGUMENTS`

Se `$ARGUMENTS` e' vuoto, ricava il criterio dalla frase dell'utente.
Se non e' ricavabile nemmeno da li', chiedi quale criterio analizzare —
non sceglierne uno di default.

## Chi orchestra

Il **main loop** (CLAUDE.md §3 Fase 2). Gli agenti non si invocano tra
loro: la sequenza sotto è una catena di invocazioni dirette.

## Quando usarlo

Dopo aver ricevuto la lista dei criteri dalla fase iniziale, quando l'utente vuole analizzare un singolo criterio.

## Utilizzo

```
Analizza C1
```

oppure:

```
Analizza il criterio C2
```

## Prerequisiti obbligatori

- `output/03_criteria/criteria/criterion_Cx.md` deve esistere
- `output/03_criteria/criteria_matrix.md` deve esistere
- `02_graph/index.md` deve esistere

Se mancano, avviare prima `start_bid_analysis`.

## Sequenza eseguita

| # | Chi | Cosa |
|---|---|---|
| 1 | main loop | naviga `02_graph/index.md` + `criterion_Cx.md` → lista documenti rilevanti |
| 2 | `pdf-reader` + `drawing-reader` | in parallelo, uno per documento → schede in `output/04_doc_summaries/` |
| 3 | `criterion-agent` | criterio e sottocriteri, evidenze, gap, proposte, domande guida → bozza `Cx_output.md` (senza Audit) |
| 4 | `evidence-auditor` | audit in formato tabella, aggiornamento dei registri, `criteri_stato` in `manifest.json` |
| 5 | main loop | presenta proposte e domande guida all'utente, invoca `context-monitor` |

Il feedback del professionista si compila poi direttamente in
`Cx_output.md` e si elabora con `/process_feedback`.

## Output

- `output/05_criteria_outputs/Cx_output.md` — output completo
- `output/04_doc_summaries/[codice]_*.md` — schede documenti
- `output/06_registers/proposal_register.md` — aggiornato
- `output/06_registers/gap_register.md` — aggiornato
- `output/06_registers/audit_summary.md` — aggiornato

Il feedback viene raccolto direttamente nel file `Cx_output.md` (campo `stato_feedback`) ed elaborato con `/process_feedback`.

## Regola fondamentale

L'audit è automatico e obbligatorio.
Il feedback utente è obbligatorio prima di chiudere il criterio.
I sottocriteri vengono gestiti internamente — nessun file separato.
