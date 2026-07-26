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

- `00_input/disciplinare/` deve contenere almeno un file (il disciplinare)
- `PROJECT_CONFIG.json` deve esistere con almeno `gara.nome` compilato

Se i prerequisiti non sono soddisfatti:
"Carica il disciplinare in 00_input/disciplinare/ e compila
PROJECT_CONFIG.json prima di procedere."

## Procedura

### Step 1 — Verifica input
```bash
find 00_input/disciplinare -type f | head -5
```
Se vuota: interrompi con messaggio esplicativo.

### Step 2 — Analisi disciplinare
Esegui `disciplinare-analyst` con le istruzioni standard
piu' la produzione del gara brief (Step 3).

Output standard:
- `03_criteria/criteria_matrix.md` + `.json`
- `03_criteria/criteria_checklist.md`
- `03_criteria/criteria/criterion_Cx.md` per ogni criterio

### Step 3 — Produzione gara brief

Dopo l'estrazione dei criteri, produci `03_criteria/gara_brief.md`
seguendo il template `03_criteria/gara_brief_template.md`.

Il gara brief si costruisce interamente dalle informazioni del
disciplinare — nessun elaborato richiesto.

**Sezione "Struttura del punteggio":**
Tabella con tutti i criteri, punti max, peso percentuale sul totale.
Identifica i criteri con peso > 20% come alta priorita'.

**Sezione "Criteri in dettaglio":**
Una scheda per criterio: **Sommario** (cosa valuta, come si
attribuisce il punteggio, elementi premianti) e tabella
**Deliverables richiesti** (documento da produrre, vincolo di
formato, articolo del disciplinare). Ogni scheda chiude con
`**Stato analisi:** non ancora analizzato` — il segnaposto che
la pipeline della Fase 2 aggiorna (evidence-auditor a fine audit,
feedback-processor a feedback elaborato).
Gli stessi deliverables vanno registrati anche in
`PROJECT_CONFIG.json → deliverables` (una voce per documento
richiesto, per criterio — vedi agente disciplinare-analyst).

**Sezione "Dove si concentra il potenziale":**
Criteri con elementi premianti ampi o subcriteri non rigidi —
dove il sistema puo' fare la differenza. Basarsi sui
`fuori_scope_risks` vuoti e `modification_limits` permissivi.

**Sezione "Vincoli principali":**
`modification_limits` non vuoti, criteri con punteggio
predeterminato, esclusioni esplicite del disciplinare.

**Sezione "Elaborati citati nel disciplinare":**
Estrai dal testo del disciplinare tutti i riferimenti a
documenti di progetto (es. "relazione tecnica", "computo metrico",
"planimetrie", "PSC"). Questa e' la prima lista di cosa serve
prima ancora di aprire gli elaborati — una pre-checklist.

**Sezione "Domande aperte per il professionista":**
Aspetti tecnici ambigui o criteri che richiedono valutazione
immediata per impostare la strategia. Massimo 5 domande.

### Step 4 — Presentazione risultati

```
Analisi disciplinare completata.

Criteri estratti: N (tot. X punti)
File prodotti:
  03_criteria/criteria_matrix.md
  03_criteria/criteria/criterion_Cx.md (N file)
  03_criteria/gara_brief.md  ← leggi questo
  11_view/03_criteria/gara_brief.html  ← versione da condividere

Prossimi passi:
  1. Apri l'artifact HTML e condividilo con il professionista
     (si apre nel browser, funziona offline, ha i campi per le risposte)
  2. Carica gli elaborati in 00_input/elaborati/
  3. Avvia la Fase 1 completa con: start_bid_analysis
```

## Note operative

Il gara brief e' il documento da condividere con il professionista
e l'operatore per il Gate A (strategia) anche prima del grafo.
Permette di raccogliere le prime indicazioni strategiche sul
peso dei criteri e sulle aree di opportunita' senza dover
aspettare l'ingestione degli elaborati.
