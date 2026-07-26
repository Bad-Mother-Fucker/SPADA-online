---
argument-hint: <criteri separati da spazio, es. C1 C3>
description: Analizza piu' criteri, ciascuno in contesto separato, con consolidamento finale dei registri.
---

# Command — Analyze multiple criteria

## Argomento

Criteri da analizzare: `$ARGUMENTS`

Se `$ARGUMENTS` e' vuoto, ricava i criteri dalla frase dell'utente.
Se non sono ricavabili, chiedi quali criteri analizzare — non assumere
"tutti".

## Chi orchestra

Il **main loop** (CLAUDE.md §3 Fase 2). Per ogni criterio richiesto
esegue la pipeline completa — `pdf-reader`/`drawing-reader` →
`criterion-agent` → `evidence-auditor` → `context-monitor` — in un
contesto separato. Nessun agente ne invoca un altro.

I criteri possono procedere in parallelo (una catena per criterio); il
consolidamento dei registri avviene solo alla fine, quando tutte le
catene sono chiuse.

## Quando usarlo

Quando l'utente vuole analizzare più criteri contemporaneamente.

## Utilizzo

```
Analizza C1 e C2
```

oppure:

```
Analizza tutti i criteri
```

oppure:

```
Analizza C1, C3 e C5
```

## Parallelizzazione

Ogni criterio richiesto viene assegnato a un `criterion-agent` separato, in contesto dedicato.

I contesti sono indipendenti — non si leggono a vicenda.

Al termine, i risultati vengono presentati all'utente criterio per criterio.

## Pipeline per ogni criterio in parallelo

Ogni `criterion-agent` esegue la pipeline completa indipendentemente:

1. Lettura criterio e sottocriteri
2. Selezione documenti
3. Lettura documenti e tavole
4. Gap analysis (criterio + sottocriteri interni)
5. Proposte
6. Domande guida (scelta, scoring, posizionamento, validazione)
7. Audit automatico
8. Aggiornamento registri

## Feedback utente

Dopo che tutti i `criterion-agent` hanno completato, il sistema presenta:

- I risultati di ogni criterio
- Le proposte di ogni criterio con stato audit
- Le domande guida per ogni criterio

L'utente risponde criterio per criterio.

Il feedback viene raccolto direttamente nel file `Cx_output.md` di ogni criterio (campo `stato_feedback`) ed elaborato con `/process_feedback`.

## Output

Per ogni Cx:

- `output/05_criteria_outputs/Cx_output.md`
- `output/04_doc_summaries/[codice]_*.md`

Registri aggiornati una volta completato il ciclo:

- `output/06_registers/proposal_register.md`
- `output/06_registers/gap_register.md`
- `output/06_registers/audit_summary.md`
- `_state/project_state_snapshot.md` (via `context-monitor`)
