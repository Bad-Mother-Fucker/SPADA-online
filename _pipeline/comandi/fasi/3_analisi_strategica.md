# Fase 3 — Analisi strategica (richiede approvazione)

Dipende da: `_state/handoff/2_costruzione_grafo.json`.

## Esecuzione

`strategy-auditor`, come descritto nel proprio file agente: quattro
analisi (budget sicurezza, gap prezzi via server MCP `prezzario`,
viabilità cantiere, capacità di investimento migliorativo). Presenta
solo dati, nessuna raccomandazione. Scrive
`output/03_criteria/strategy_audit.md` con la sezione "Indicazioni
strategiche del professionista" precompilata a vuoto.

## Intervento umano obbligatorio

Questa fase **non si considera completata** dal solo output
dell'agente. Resta `richiede_approvazione: true` finché il
professionista non compila la sezione "Indicazioni strategiche del
professionista" in `output/03_criteria/strategy_audit.md` (via UI —
Sprint 6 — o direttamente nel file). `spada-fase` marca lo stato
`completata` solo quando quella sezione risulta compilata (verifica
euristica: la sezione non contiene più i segnaposto vuoti del
template).

## A fine fase (quando approvata)

Scrivi `_state/handoff/3_analisi_strategica.json`:
- `entita_chiave`: classificazioni delle 4 analisi, indicazioni
  strategiche del professionista (tono, priorità per criterio)
- `riferimenti`: `output/03_criteria/strategy_audit.md`
- `alert`: classificazioni CRITICO/ALTO/NON RAPPRESENTATIVO

Aggiungi un paragrafo a `_state/memoria.md`: sintesi delle 4
classificazioni e delle indicazioni del professionista.
