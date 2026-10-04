# Fase 2 — Analisi degli elaborati (costruzione del knowledge graph)

Dipende da: `_state/handoff/1_acquisizione_documenti.json`.

## Esecuzione

1. `graph-builder`, come descritto nel proprio file agente e nella skill
   `build-knowledge-graph`: 8 invocazioni in sequenza/parallelo (Fasi 0-2,
   poi A/B/C in parallelo, poi D/E/F in parallelo, poi 4-5 finali) —
   **tu, main loop di questa fase, invochi il subagente 8 volte**, non
   una sola. Segui esattamente la tabella in
   `_pipeline/agents/graph-builder.md`.

   **Attendi ogni round prima del successivo e non chiudere il turno
   finché l'ultima invocazione non è terminata**: lanciale in primo
   piano, oppure, se le lanci in background, resta in attesa delle
   notifiche di completamento. La fase finisce quando l'handoff è
   scritto, non quando i subagenti sono partiti.
2. `graph-lint` (skill) per segnalare orfani, contraddizioni, wikilink rotti.
3. `brief-writer` con motivo **«Fine Fase 2 (elaborati)»**: porta nel
   gara brief ciò che gli elaborati dicono (In sintesi, Criteri in
   dettaglio → «Base di progetto», Documentazione di gara, Quadro
   tecnico-economico, Potenziale, Vincoli, Prossimi passi).
4. **Domande della Fase 2** — dopo il brief, registra le domande che solo
   la lettura degli elaborati fa nascere, e supera quelle della Fase 1 a
   cui gli elaborati hanno già risposto (vedi sotto). Fonti tipiche:
   discordanze in `02_graph/economic_framework.md` che toccano un
   criterio o il valore di progetto da superare (quesiti alla stazione
   appaltante); elaborati citati dal disciplinare ma assenti
   (`missing` in `02_graph/log.md`); elaborati fuori elenco o in
   versione diversa; scelte tecniche che il progetto lascia aperte.
   Ogni domanda cita il documento e il punto da cui nasce.

```bash
python3 "$CLAUDE_CONFIG_DIR/scripts/domande/domande.py" elenco --aperte
python3 "$CLAUDE_CONFIG_DIR/scripts/domande/domande.py" aggiungi --origine fase_2 \
  --categoria quesito_sa|tecnica|amministrativa --criterio C2 \
  --testo "..." --perche "..." --fonte "economic_framework D12: G-04 15 kWh vs RS-02 20 kWh"
python3 "$CLAUDE_CONFIG_DIR/scripts/domande/domande.py" supera D-003 \
  --motivo "risolta dagli elaborati: ..." [--da D-009]
```

## A fine fase

Scrivi `_state/handoff/2_costruzione_grafo.json`:
- `entita_chiave`: numero documenti indicizzati, numero orfani,
  discordanze principali
- `riferimenti`: `02_graph/index.md`, `02_graph/scope.md`,
  `02_graph/economic_framework.md`, `output/03_criteria/gara_brief.md`
- `alert`: orfani segnalati da graph-lint, documenti non ancora
  estratti, elaborati citati e mancanti

Aggiungi un paragrafo a `_state/memoria.md`: dimensione del grafo,
qualità della copertura, alert principali, domande aggiunte e superate.
