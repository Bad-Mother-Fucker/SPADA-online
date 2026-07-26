---
argument-hint: <codice elaborato o nome file aggiornato>
description: Re-ingest di un elaborato aggiornato o di un chiarimento della stazione appaltante nel knowledge graph.
---

# Command — Update Document

## Argomento

Documento aggiornato: `$ARGUMENTS`

Atteso: il codice elaborato (es. `08.Q.R02`) o il nome del file nuovo.
Se `$ARGUMENTS` e' vuoto, chiedi quale documento e' stato aggiornato —
non dedurlo dal file piu' recente in `input/`.

## Trigger

"e' uscita una nuova versione di [codice]", "aggiorna [codice] nel grafo",
"la stazione appaltante ha pubblicato un chiarimento",
"hanno cambiato il computo metrico", "re-ingest [codice]"

## Due casi, stesso meccanismo

| Caso | Cosa cambia |
|---|---|
| **Nuova versione di un elaborato** | Una pagina nodo passa a `is_latest: false`, ne nasce una nuova |
| **Chiarimento della stazione appaltante** | Il chiarimento modifica il disciplinare: possono cambiare criteri, punteggi o vincoli |

Il secondo caso e' piu' invasivo del primo: un chiarimento che tocca i
criteri invalida le analisi gia' fatte. Vedi lo Step 5.

## Prerequisiti

- `02_graph/index.md` deve esistere (grafo gia' costruito)
- Il file aggiornato deve essere gia' in `input/` (elaborati o
  disciplinare)

Se il grafo non esiste, non serve un re-ingest: esegui
`/start_bid_analysis`, che lo costruisce da zero includendo il file nuovo.

## Procedura

### Step 1 — Identifica cosa e' cambiato

Individua nel grafo la pagina nodo della versione precedente:
`version_group` corrispondente e `is_latest: true`.
La regola di assegnazione di `version_group` e il criterio di
ordinamento tra versioni sono in `references/graph-schema.md`.

Se non esiste alcuna pagina per quel `version_group`, non e' un
aggiornamento ma un documento nuovo: segnalalo e chiedi conferma prima
di procedere — un elaborato che appare a gara avviata e' un fatto che
il professionista deve conoscere.

### Step 2 — Estrai il testo del documento nuovo

Invoca `document-preprocessor` in **Fase B** (estrazione on-demand di un
singolo documento). Non l'estrazione batch: serve un solo file.

### Step 3 — Re-ingest nel grafo

Invoca `graph-builder` in modalita' re-ingest sul documento indicato
(procedura "Gestione re-ingest" nel suo file). Rewrite, non append:

1. pagina vecchia → `is_latest: false` + arco `versione_successiva`
2. pagina nuova → `is_latest: true` + arco `versione_precedente`
3. `scope.md` ed `economic_framework.md` riallineati alla versione
   `is_latest: true`
4. Fase E (contraddizioni) rieseguita sui due documenti, per far
   emergere le discrepanze tra versioni invece di sovrascriverle in
   silenzio
5. append a `02_graph/log.md` con l'entry `re-ingest`

### Step 4 — Lint

```bash
node scripts/graph/graph_lint.js
```

Poi `.claude/skills/graph-lint/SKILL.md` sui findings.

### Step 5 — Verifica l'impatto sulle analisi gia' fatte

**Questo step e' il motivo per cui il comando esiste.** Un documento
aggiornato dopo che dei criteri sono gia' stati analizzati puo' aver
invalidato quelle analisi.

Per ogni criterio con `criteri_stato[Cx].analizzato: true`
(`manifest.json`), verifica se il documento aggiornato compare nel
suo `supported_by`. In caso affermativo, presenta:

```
Documento aggiornato: [codice] — versione precedente [codice-prec]

Criteri che citano questo documento come evidenza:
- Cx — [N] proposte, stato feedback: [stato]
- Cy — [N] proposte, stato feedback: [stato]

Le evidenze di questi criteri sono state estratte dalla versione
precedente. Cosa e' cambiato: [sintesi dalle contraddizioni rilevate
nello Step 3, o "non determinabile dal testo"]

Vuoi rianalizzare questi criteri? Le decisioni gia' prese restano in
Cx_output.md e non vengono perse.
```

**Non rianalizzare automaticamente.** Il professionista decide: la
rianalisi puo' invalidare proposte gia' approvate, ed e' una sua scelta,
non tua.

Se il documento aggiornato e' il **disciplinare** (chiarimento), verifica
anche se cambiano criteri, punteggi o vincoli in
`output/03_criteria/criteria_matrix.md`. Se cambiano, segnalalo come blocco:
tutte le analisi in corso poggiano su quella matrice.

## Output

- `02_graph/nodes/` — pagina nuova creata, pagina precedente aggiornata
- `02_graph/index.md` — rigenerato
- `02_graph/log.md` — entry `re-ingest`
- `output/01_extracted/text/[codice].md` — testo estratto del documento nuovo
- Report a schermo con l'impatto sui criteri gia' analizzati

## Cosa questo comando non fa

- Non rianalizza criteri di sua iniziativa
- Non cancella la pagina della versione precedente: resta nel grafo con
  `is_latest: false`, perche' le analisi gia' fatte la citano
- Non modifica `output/05_criteria_outputs/Cx_output.md` ne' i registri
