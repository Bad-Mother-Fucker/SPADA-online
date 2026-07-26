# Fase 2 — Costruzione del knowledge graph

Dipende da: `_state/handoff/1_acquisizione_documenti.json`.

## Esecuzione

`graph-builder`, come descritto nel proprio file agente e nella skill
`build-knowledge-graph`: 8 invocazioni in sequenza/paralleo (Fasi 0-2,
poi A/B/C in parallelo, poi D/E/F in parallelo, poi 4-5 finali) — **tu,
main loop di questa fase, invochi il subagente 8 volte**, non una sola.
Segui esattamente la tabella in `_pipeline/agents/graph-builder.md`.

Al termine: `graph-lint` (skill) per segnalare orfani, contraddizioni,
wikilink rotti.

## A fine fase

Scrivi `_state/handoff/2_costruzione_grafo.json`:
- `entita_chiave`: numero documenti indicizzati, numero orfani
- `riferimenti`: `02_graph/index.md`, `02_graph/scope.md`,
  `02_graph/economic_framework.md`
- `alert`: orfani segnalati da graph-lint, documenti non ancora estratti

Aggiungi un paragrafo a `_state/memoria.md`: dimensione del grafo,
qualità della copertura, alert principali.
