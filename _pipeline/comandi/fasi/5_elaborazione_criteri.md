# Fase 5 — Ricerca soluzioni (elaborazione dei criteri)

Dipende da: `_state/handoff/4_domande_professionista.json` (indicazioni e
risposte del professionista nelle `decisioni`). Il contesto è completo:
elaborati nel grafo, audit strategico, risposte del professionista in
`output/07_questions/risposte_professionista.md` e in
`02_graph/professionista.md`.

## Esecuzione

Per ogni criterio in `manifest.json → gara.criteri_attivi` (se vuoto:
tutti i criteri in `output/03_criteria/criteria/`), pipeline
`criterion-agent` → `evidence-auditor` come descritta nei rispettivi
file agente (lettura documenti prioritari, evidenze, gap, proposte,
domande guida, audit). Criteri multipli: contesto separato per
ciascuno, consolidamento registri alla fine.

## A fine fase

Scrivi `_state/handoff/5_elaborazione_criteri.json`:
- `entita_chiave`: elenco proposte per criterio con esito audit
- `riferimenti`: ogni `output/05_criteria_outputs/Cx_output.md`,
  `output/06_registers/proposal_register.md`
- `alert`: proposte `da integrare` (diventano domande guida),
  criteri con evidenza debole

Aggiungi un paragrafo a `_state/memoria.md` per ogni criterio elaborato.

Questa fase resta `richiede_approvazione` solo nel senso che il
feedback del professionista sulle proposte va elaborato con
`/process_feedback` prima della Fase 6 — non blocca `spada-fase 5` in
sé (che si conclude con le proposte proposte, non ancora decise).
