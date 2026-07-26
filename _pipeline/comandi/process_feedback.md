---
argument-hint: <criterio, es. C1>
description: Elabora il feedback compilato dal professionista in 05_criteria_outputs/Cx_output.md.
---

# Command — Process Feedback

## Argomento

Criterio di cui elaborare il feedback: `$ARGUMENTS`

Se `$ARGUMENTS` e' vuoto, ricava il criterio dalla frase dell'utente.
Se non e' ricavabile, chiedi quale criterio elaborare.

Usa agente: `.claude/agents/feedback-processor`

## Trigger

"feedback C[x] pronto", "elabora feedback C[x]",
"processa il feedback di C[x]", "feedback [Cx] completato"

## Prerequisito

`05_criteria_outputs/Cx_output.md` deve esistere con almeno
una proposta con campo Decisione compilato.
`02_graph/index.md` deve esistere.

## Comportamento

Attiva `feedback-processor` che legge le decisioni, crea i nodi
proposta approvati in `02_graph/proposals/`, aggiorna index.md
e i registri, aggiorna la scheda del criterio nel gara brief
(stato "completato" con le proposte approvate), chiude il file
output con `stato_feedback: completato`.

Al termine presenta il report con proposte approvate, punteggio
aggiornato e link ai nodi creati.
