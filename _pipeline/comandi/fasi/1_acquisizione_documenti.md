# Fase 1 — Acquisizione documenti

Nessuna dipendenza da handoff precedenti (prima fase).

## Esecuzione

1. `document-preprocessor` — censisce `input/`, gestisce eventuali
   `.p7m`, estrae testo in `output/01_extracted/text/`. Se
   `output/01_extracted/text/` è già popolata e `input/_manifest_input.md`
   esiste, aggiunge solo i file mancanti (non rielabora quelli già estratti).
2. `disciplinare-analyst` — estrae criteri e sottocriteri dal
   disciplinare in `input/disciplinare/`, assegna ID `C1, C2, ...`
   nell'ordine reale del disciplinare, scrive `manifest.json → deliverables`
   e completa i campi vuoti di `manifest.json → gara` (stazione
   appaltante, CIG, CUP, importo, scadenza).
   Produce la **prima stesura del gara brief**
   (`output/03_criteria/gara_brief.md`) con le sezioni fisse del
   template: popola quelle che il disciplinare permette di scrivere e
   lascia le altre con la riga «Da completare». Il brief si arricchisce
   nelle fasi successive; non contiene domande.
   Registra le **domande della Fase 1** nel registro unico (vedi sotto).
3. **Verifica di completezza** — se `input/elaborati/` è vuota o
   palesemente incompleta rispetto ai deliverables attesi, segnalalo
   nell'handoff come `alert` (non bloccare la fase).

## Domande della Fase 1

Solo ciò che il disciplinare da solo permette di chiedere, e che serve
prima della strategia: adempimenti con scadenza (sopralluogo, quesiti
alla stazione appaltante), requisiti dell'impresa per i criteri tabellari
o premiali, ambiguità del disciplinare da chiarire con la stazione
appaltante. Niente domande che gli elaborati potranno chiarire: quelle
le pone la Fase 2, dopo averli letti. Dalla radice della gara:

```bash
python3 "$CLAUDE_CONFIG_DIR/scripts/domande/domande.py" aggiungi --origine fase_1 \
  --categoria amministrativa|quesito_sa --testo "..." --perche "..." \
  --fonte "art. X, p. N" [--criterio C5]
```

## A fine fase

Scrivi `_state/handoff/1_acquisizione_documenti.json`:
- `entita_chiave`: nome gara, criteri individuati con punteggi,
  stazione appaltante, scadenza
- `riferimenti`: `output/03_criteria/gara_brief.md`,
  `output/03_criteria/criteria_matrix.md`, ogni
  `output/03_criteria/criteria/criterion_Cx.md`,
  `output/07_questions/domande.json`
- `alert`: documenti mancanti rispetto ai deliverables attesi, se
  rilevati; scadenze bloccanti entro 7 giorni

Aggiungi un paragrafo a `_state/memoria.md`: gara, criteri individuati,
eventuali lacune documentali, numero di domande registrate.
