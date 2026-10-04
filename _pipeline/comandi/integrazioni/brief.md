# Riallineamento del gara brief

Il gara brief di questa gara è stato scritto con un template precedente,
o è rimasto indietro rispetto alle fasi già eseguite. Riportalo al
template corrente con tutto ciò che le fasi completate hanno prodotto,
e registra le domande che quelle fasi avrebbero posto con il processo
attuale. Nessuna fase va rieseguita e il grafo non si tocca.

## Esecuzione

1. **Domande del brief precedente** — se il brief ha ancora una sezione
   «Domande aperte per il professionista», importale nel registro:
   `python3 "$CLAUDE_CONFIG_DIR/scripts/domande/domande.py" importa-brief`
   (idempotente: le risposte già date si conservano).
2. **Brief** — `brief-writer` con motivo «Riallineamento»: struttura del
   template corrente, sezioni popolate con le fonti di tutte le fasi che
   in `_state/fasi.json` risultano `completata` (Fase 1: disciplinare;
   Fase 2: grafo; Fase 3: audit strategico; Fase 4: risposte del
   professionista). Le sezioni che spettano a fasi non ancora eseguite
   restano «Da completare».
3. **Domande delle fasi già eseguite** — per ogni fase completata,
   registra le domande che il suo comando prevede
   (`_pipeline/comandi/fasi/<n>_*.md`, sezione sulle domande), con
   l'origine di quella fase; supera quelle a cui le fasi successive
   hanno già risposto. Se l'audit strategico (Fase 3) contiene ancora
   una sezione «Domande chiave», quelle domande vanno nel registro con
   `--origine fase_3 --categoria strategica`.

## Alla fine

Aggiungi un paragrafo a `_state/memoria.md`: brief riallineato, domande
aggiunte e superate per origine. Non scrivere handoff di fase e non
toccare `_state/fasi.json`.
