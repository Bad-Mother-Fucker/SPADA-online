# Command — Analyze Disciplinare

Usa agente: `disciplinare-analyst`

## Scopo

Analizza il disciplinare di gara e produce la matrice criteri,
le pagine criterio e il **gara brief** — il documento di sintesi
che risponde alla domanda: *cosa dobbiamo produrre per questa gara?*

Puo' essere eseguito appena il disciplinare e' disponibile,
**prima di caricare qualsiasi elaborato di progetto.**
E' il punto di ingresso della Fase 0 del processo operativo.

## Trigger

"analizza il disciplinare", "analyze disciplinare",
"leggi il disciplinare", "analisi preliminare disciplinare",
"cosa chiede questa gara", "genera il gara brief"

## Prerequisiti

- `input/disciplinare/` deve contenere almeno un file (il disciplinare)
- `manifest.json` deve esistere con almeno `gara.nome` compilato

Se i prerequisiti non sono soddisfatti:
"Carica il disciplinare in input/disciplinare/ e compila
manifest.json prima di procedere."

## Procedura

### Step 1 — Verifica input
```bash
find input/disciplinare -type f | head -5
```
Se vuota: interrompi con messaggio esplicativo.

### Step 2 — Analisi disciplinare
Esegui `disciplinare-analyst` con le istruzioni standard
piu' la produzione del gara brief (Step 3).

Output standard:
- `output/03_criteria/criteria_matrix.md` + `.json`
- `output/03_criteria/criteria_checklist.md`
- `output/03_criteria/criteria/criterion_Cx.md` per ogni criterio

### Step 3 — Prima stesura del gara brief e domande

Dopo l'estrazione dei criteri, scrivi la prima stesura di
`output/03_criteria/gara_brief.md` seguendo il template
`.claude/templates/gara_brief_template.md` (pipeline condivisa): tutte
le sezioni fisse, popolate con cio' che il disciplinare permette di
scrivere, le altre con la riga «Da completare». Il brief si arricchisce
nelle fasi successive (brief-writer). Il dettaglio delle sezioni e'
nell'agente `disciplinare-analyst`, sezione «Produzione del gara brief».

Gli stessi deliverables delle schede criterio vanno registrati anche in
`manifest.json → deliverables`.

Il brief non contiene domande: quelle che il disciplinare fa nascere
(adempimenti con scadenza, requisiti per i criteri tabellari, quesiti
alla stazione appaltante) si registrano con
`python3 "$CLAUDE_CONFIG_DIR/scripts/domande/domande.py" aggiungi --origine fase_1 ...`
e il professionista le risponde nella Fase 4.

### Step 4 — Presentazione risultati

```
Analisi disciplinare completata.

Criteri estratti: N (tot. X punti)
File prodotti:
  output/03_criteria/criteria_matrix.md
  output/03_criteria/criteria/criterion_Cx.md (N file)
  output/03_criteria/gara_brief.md  ← leggi questo
  output/11_view/output/03_criteria/gara_brief.html  ← versione da condividere

Prossimi passi:
  1. Apri l'artifact HTML e condividilo con il professionista
     (si apre nel browser, funziona offline)
  2. Carica gli elaborati in input/elaborati/
  3. Avvia la Fase 1 completa con: start_bid_analysis
```

## Note operative

Il gara brief e' il documento da condividere con il professionista
e l'operatore fin dalla Fase 1: scadenze, punteggio e vincoli di
formato non aspettano l'ingestione degli elaborati. Le domande, invece,
si raccolgono tutte nel registro e si rispondono nella Fase 4, quando
anche elaborati e audit strategico hanno detto la loro.
