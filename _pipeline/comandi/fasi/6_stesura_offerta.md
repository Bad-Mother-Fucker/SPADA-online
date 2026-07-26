# Fase 6 — Stesura dell'offerta

Dipende da: `_state/handoff/5_revisione_proposte.json` (proposte
approvate) e `_state/handoff/3_analisi_strategica.json` (priorità).

## Prerequisiti

- Tutti i criteri attivi hanno `stato_feedback: completato`
- `vincoli_offerta_tecnica.md` compilato (Sezioni A e B)

Se un prerequisito manca, non procedere: segnalalo nell'handoff come
`alert` e lascia la fase `da_rivedere`.

## Esecuzione

`offer-writer`, come descritto nel proprio file agente: legge le
proposte approvate da `02_graph/proposals/` e i vincoli da
`vincoli_offerta_tecnica.md`, produce la bozza in `output/10_offer/`.
Non inventa contenuti, non aggiunge proposte non approvate.

## A fine fase

Scrivi `_state/handoff/6_stesura_offerta.json`:
- `entita_chiave`: struttura offerta prodotta (criteri coperti, facciate usate)
- `riferimenti`: file in `output/10_offer/`
- `alert`: deliverable richiesti (da `manifest.json → deliverables`) non coperti dalla bozza

Aggiungi un paragrafo a `_state/memoria.md`: stato della bozza.
