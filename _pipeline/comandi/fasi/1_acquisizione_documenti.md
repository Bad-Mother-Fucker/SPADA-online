# Fase 1 — Acquisizione documenti

Nessuna dipendenza da handoff precedenti (prima fase).

## Esecuzione

1. `document-preprocessor` — censisce `input/`, gestisce eventuali
   `.p7m`, estrae testo in `output/01_extracted/text/`. Se
   `output/01_extracted/text/` è già popolata e `input/_manifest_input.md`
   esiste, aggiunge solo i file mancanti (non rielabora quelli già estratti).
2. `disciplinare-analyst` — estrae criteri e sottocriteri dal
   disciplinare in `input/disciplinare/`, assegna ID `C1, C2, ...`
   nell'ordine reale del disciplinare, produce
   `output/03_criteria/gara_brief.md` e scrive `manifest.json → deliverables`.
   Completa anche i campi vuoti di `manifest.json → gara` (stazione
   appaltante, CIG, CUP, importo, scadenza) — vedi `/new_bid`.
3. **Verifica di completezza** (Sprint 8 la renderà un gate esplicito
   per la Fase 3; già ora: se `input/elaborati/` è vuota o
   palesemente incompleta rispetto ai deliverables attesi, segnalalo
   nell'handoff come `alert`, non bloccare la fase).

## A fine fase

Scrivi `_state/handoff/1_acquisizione_documenti.json`:
- `entita_chiave`: nome gara, criteri individuati con punteggi,
  stazione appaltante, scadenza
- `riferimenti`: `output/03_criteria/gara_brief.md`,
  `output/03_criteria/criteria_matrix.md`, ogni
  `output/03_criteria/criteria/criterion_Cx.md`
- `alert`: documenti mancanti rispetto ai deliverables attesi, se rilevati

Aggiungi un paragrafo a `_state/memoria.md`: gara, criteri individuati,
eventuali lacune documentali.
