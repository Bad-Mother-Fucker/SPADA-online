# Fase 3 — Analisi strategica

Dipende da: `_state/handoff/2_costruzione_grafo.json`.

## Esecuzione

1. `strategy-auditor`, come descritto nel proprio file agente: quattro
   analisi (budget sicurezza, gap prezzi via server MCP `prezzario`,
   viabilità cantiere, capacità di investimento migliorativo). Presenta
   solo dati, nessuna raccomandazione. Scrive
   `output/03_criteria/strategy_audit.md` (analisi e riepilogo: niente
   domande e niente indicazioni del professionista nel documento).
   Registra le **domande strategiche** nel registro unico
   (`domande.py aggiungi --origine fase_3 --categoria strategica`).
2. `brief-writer` con motivo **«Fine Fase 3 (audit)»**: porta le
   classificazioni nel Quadro tecnico-economico, raffina il Potenziale,
   una frase in In sintesi, Prossimi passi.

La fase non ha un checkpoint proprio: le domande e le indicazioni
strategiche del professionista si raccolgono tutte nella Fase 4.

## A fine fase

Scrivi `_state/handoff/3_analisi_strategica.json`:
- `entita_chiave`: classificazioni delle 4 analisi
- `riferimenti`: `output/03_criteria/strategy_audit.md`,
  `output/07_questions/domande.json`
- `alert`: classificazioni CRITICO/ALTO/NON RAPPRESENTATIVO

Aggiungi un paragrafo a `_state/memoria.md`: sintesi delle 4
classificazioni e numero di domande strategiche registrate.
