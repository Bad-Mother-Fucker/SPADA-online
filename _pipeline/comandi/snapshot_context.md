# Command — Snapshot context

Usa agente:

```
context-monitor
```

## Quando usarlo

- Automaticamente dopo ogni criterio completato con feedback utente
- Automaticamente dopo la fase iniziale di indicizzazione
- Automaticamente dopo analisi multi-criterio
- Su richiesta esplicita dell'utente
- Quando il contesto si avvicina alle soglie

## Obiettivo

- Creare o aggiornare lo snapshot operativo
- Verificare se è sicuro pulire il contesto
- Preservare: criteri, fonti, gap, proposte, audit, decisioni utente, domande aperte

## Prerequisiti

Prima di eseguire, verificare che siano aggiornati:

- `03_criteria/criteria_matrix.md`
- `06_registers/proposal_register.md`
- `06_registers/audit_summary.md`
- `05_criteria_outputs/Cx_output.md` — per ogni criterio analizzato (verificare `stato_feedback`)

## Output

- `08_state/project_state_snapshot.md` — snapshot operativo completo
- `08_state/context_monitor_report.md` — stato contesto e soglie
- `08_state/decision_log.md` — decisioni prese (incluse decisioni utente)
- `08_state/open_issues.md` — problemi aperti e domande senza risposta
- `08_state/next_actions.md` — prossime azioni raccomandate

## Soglie operative

```
0-120k token:    OK
120k-180k token: attenzione
180k-220k token: preparare snapshot
220k-250k token: bloccare nuove letture massive
250k-280k token: snapshot obbligatorio
oltre 280k token: zona rossa
```

## Regola

Non pulire il contesto se esistono decisioni utente o informazioni importanti solo in chat e non nei file.
