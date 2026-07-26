# Command — Graph Health

Usa skill: `.claude/skills/graph-lint/SKILL.md`

## Trigger

"controlla il grafo", "graph health", "verifica il grafo",
"lint grafo", "ci sono orfani", "stato del grafo"

## Prerequisito

`02_graph/index.md` deve esistere.
Se non esiste: "Il grafo non e' stato ancora costruito.
Avvia prima l'analisi preliminare per costruirlo."

## Procedura

1. Check meccanici:

   ```bash
   node scripts/graph/graph_lint.js
   ```

   Exit `2` significa grafo assente: fermati e segnalalo.

2. Esegui `.claude/skills/graph-lint/SKILL.md` a partire dai findings
   dello script — valutazione di merito su orfani, archi solo ereditati
   e contraddizioni economiche.

Nessun altro agente coinvolto. Nessuna modifica al grafo: il lint
segnala, non corregge.

## Output

Report nel contesto con categorie ERRORE / ALERT / ATTENZIONE / OK.
Aggiornamento sezione "Orfani" in `02_graph/index.md`.
Append entry in `02_graph/log.md`.
