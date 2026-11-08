---
name: deliverable-computo-metrico
description: Usa quando devi produrre un computo metrico dell'offerta tecnica (deliverable di tipo computo_metrico, Fase 7) — computo delle migliorie o computo dei lavori a base di gara rimodulato. Procedimento in tre stadi approvati dal professionista — elenco delle voci, bozza, definitivo — con le regole su estimativo e non estimativo. Un solo documento per tutte le proposte di tutti i criteri.
---

# Skill — Computo metrico dell'offerta

## Principio

Il computo è **un documento unico** che comprende tutte le proposte
approvate di tutti i criteri. Si produce in tre stadi; ogni sessione ne
esegue **uno solo**, scrive il suo file e si ferma. Lo stadio successivo
segue fedelmente quello approvato (modifiche a mano comprese).

| Stadio | File | Cosa decide il professionista |
|---|---|---|
| 1. Elenco delle voci | `1_voci.md` | quali lavorazioni entrano, da dove vengono le quantità, quale tariffa del prezzario |
| 2. Bozza del computo | `2_bozza.md` (+ `analisi_nuovi_prezzi.md`) | descrizioni, quantità, unità di misura, tariffe e nuovi prezzi |
| 3. Definitivo | `3_definitivo.md` | documento da consegnare (DOCX/PDF, PriMus `.xpwe` ed Excel dall'interfaccia) |

Dal definitivo il sistema genera da solo, oltre a DOCX e PDF, il computo
per ACCA PriMus (`.xpwe`, da importare con File › Importa) e un Excel
con le colonne del computo PriMus: criteri del disciplinare come Super
categorie, sub-criteri come Categorie, una voce di elenco prezzi per
ogni tariffa. Per questo le tabelle del definitivo devono avere
esattamente le colonne indicate allo stadio 3.

Non generare file Word né script: la conversione la fa il sistema.

## Regola di nomenclatura (vale per ogni deliverable)

Nel testo che va alla stazione appaltante **è vietata la nomenclatura
interna del sistema**: niente codici di proposte (P-C1-001), gap
(G-C1-002), evidenze (E-…), domande (D-…, Q-…), rischi (R-…), tavole
interne (TAV-M-…), sigle di criterio inventate dal sistema (C1, C1.1)
se il disciplinare non le usa, wikilink `[[…]]`, nomi di cartelle o di
file interni (`02_graph/…`, `Cx_output.md`).

Si usano soltanto:
- per criteri e sub-criteri, numerazione e denominazione **come nel
  disciplinare** (es. «criterio 1 — Materiali ed impiantistica,
  sub-criterio 1.1»: verifica la forma esatta nella tabella dei criteri
  del disciplinare);
- per gli elaborati, il **nome dell'elaborato così come è stato
  caricato** (es. «9_CME_Computo_Metrico_Estimativo», «Relazione
  Generale e Tecnica»), con voce, articolo, tavola o pagina;
- per le proposte, il loro titolo descrittivo, mai il codice.

Unica eccezione: nella **scaletta** e nell'**elenco delle voci** (stadio
1, documenti di lavoro per il professionista) i codici interni si possono
usare per brevità. Dalla bozza in poi, mai. Alla fine di ogni stadio il
sistema controlla il testo: se trova codici interni ti chiede di
toglierli, e l'esportazione in DOCX/PDF li rifiuta.

## Prima di tutto: quale computo, e se ha prezzi

Dai dati del deliverable (nome, `vincolo_formato`, `fonte`):

- **Variante A — computo delle migliorie**: solo le lavorazioni toccate
  dalle proposte approvate (sostituzioni, affinamenti, miglioramenti
  qualitativi di lavorazioni già previste).
- **Variante B — computo dei lavori a base di gara rimodulato**: tutto il
  computo di progetto, con le voci toccate dalle proposte riscritte
  (descrizione e, se cambia, quantità) e le altre invariate.

**Non estimativo** se il vincolo dice «non estimativo», «nessun prezzo»,
«senza importi» o vieta elementi economici: allora **nessun prezzo,
importo, totale economico o sconto** in nessuno stadio e in nessun
documento per la stazione appaltante (l'inserimento è causa di
esclusione). Il **codice tariffa** del prezzario sì: identifica la
lavorazione, non è un prezzo; il prezzario si consulta per scegliere il
codice, ma prezzi e importi letti lì non si trascrivono mai nel
computo. Solo se il vincolo chiede esplicitamente un computo estimativo
si usano i prezzi (progetto base o server MCP `prezzario` della
regione/anno della gara, mai a occhio: `TBD`).

## Tariffa di riferimento per ogni voce

Ogni voce del computo riporta una **tariffa**: il codice della voce del
prezzario regionale della gara (server MCP `prezzario`, regione e anno
indicati nel prompt) **più compatibile con la lavorazione offerta**,
oppure un **nuovo prezzo** se il prezzario non ne ha una compatibile.

Come si sceglie:
1. Parti dalla tariffa della voce di progetto sostituita (computo
   metrico estimativo ed elenco prezzi di progetto): i codici del
   prezzario regionale vi compaiono così come sono nel database (es.
   `CAM26_R02.090.070.C`, a volte con suffisso ` (CAM)`). Se la
   lavorazione offerta resta descritta da quella voce (stessa
   lavorazione, stessa unità di misura, caratteristiche offerte
   comprese nel testo della voce o sue varianti), tieni quel codice.
2. Altrimenti cerca con `cerca_voce` (più ricerche con i termini tecnici
   della lavorazione: materiale, classe, prestazione) e scegli la voce
   il cui testo copre la lavorazione offerta: stessa natura, stessa
   unità di misura, la variante (lettera finale del codice) che
   corrisponde a dimensione, classe o spessore offerti. Leggi
   l'articolo esteso prima di sceglierla.
3. Se nessuna voce copre la lavorazione offerta (caratteristica
   migliorativa che il prezzario non contempla, prodotto o prestazione
   diversi), la voce è un **nuovo prezzo**: codice `NP.OT.001`,
   `NP.OT.002`… in ordine di computo (`OT` = offerta tecnica, così non
   si confonde con i nuovi prezzi del progetto, es. `NP.ARR.001`).
   Le voci di progetto già a nuovo prezzo (`NP.…` del progetto) restano
   nuovi prezzi dell'offerta se la lavorazione cambia.

Mai un codice inventato o «assimilato» a memoria: ogni codice citato
deve esistere nel prezzario (verificalo con `cerca_voce`). Una voce di
prezzario che copre solo in parte la lavorazione offerta non basta: è un
nuovo prezzo.

**Nuovi prezzi.** Per ciascuno: descrizione estesa completa della
lavorazione (come una voce di prezzario: cosa comprende, materiali,
classi, posa, oneri), unità di misura e, nel file di lavoro
`analisi_nuovi_prezzi.md` (stadio 2), l'analisi del prezzo costruita
come le analisi del prezzario: prendi a modello l'analisi di una voce
analoga (`dettaglio_analisi`) e componi manodopera, materiali, noli e
trasporti con voci elementari del prezzario (codice, U.M., quantità per
unità di lavorazione, prezzo), più spese generali e utile d'impresa
nelle percentuali del prezzario. Un componente senza voce elementare
nel prezzario resta `TBD — prezzo da preventivo` e si segnala.
`analisi_nuovi_prezzi.md` è un documento di lavoro per il
professionista: **non va mai nella busta tecnica**, e nel computo non
estimativo i suoi prezzi non compaiono in nessun altro file.

## Fonti

| File | Cosa estrai |
|---|---|
| `02_graph/proposals/P-*.md` | proposte approvate: sezione «Lavorazioni a computo collegate» (codici voce), testo, note del professionista |
| `output/05_criteria_outputs/Cx_output.md` | «Lavorazioni a computo collegate» delle schede, se il nodo non le riporta |
| computo metrico estimativo di progetto (`input/`, scheda in `output/04_doc_summaries/`, nodo in `02_graph/nodes/`) | codice, descrizione, U.M. e quantità di progetto di ogni voce |
| `output/10_offer/relazione-tecnica/` | scaletta/bozza/definitivo, se esistono: descrizioni e quantità devono coincidere |
| `vincoli_offerta_tecnica.md` | prescrizioni sul computo nella Sezione A (note formato) |

Mai una quantità inventata: se non deducibile da computo o elaborati
quotati, `TBD — da definire` e segnalala.

## Stadio 1 — Elenco delle voci (`1_voci.md`)

```markdown
# Elenco delle voci — [nome documento] — [nome gara]
**Variante:** A (migliorie) | B (rimodulato) · **Natura:** non estimativo | estimativo

## Criterio C1 — [titolo]
### P-C1-001 — [titolo proposta]
| Voce di progetto | Tariffa di progetto | Descrizione di progetto (sintesi) | U.M. | Q.tà di progetto | Intervento | Fonte quantità | Tariffa proposta | Corrispondenza |
|---|---|---|---|---|---|---|---|---|
| 116 | CAM26_E.05.020.010.A | Consolidamento murature con rete PRFV | mq | 420,52 | miglioramento qualitativo | CME voce 116 | CAM26_E.05.020.010.B | assimilabile: la variante B è la rete a maglia offerta |
| 29 | NP.ARR.001 | Pareti divisorie HPL | mq | 1,00 | sostituzione | CME voce 29 | NP.OT.001 | nuovo prezzo: il prezzario non ha pannelli HPL compatti a nucleo pieno |
```

«Corrispondenza»: `identica` (la voce del prezzario descrive già la
lavorazione offerta), `assimilabile: …` (copre la lavorazione offerta;
spiega in una riga perché), `nuovo prezzo: …` (perché nessuna voce la
copre). Il professionista approva qui la scelta delle tariffe.

Variante B: in più, l'elenco delle categorie del computo di progetto e
il numero di voci invariate per categoria. In fondo: «Da verificare»
(proposte senza lavorazioni a computo collegate, voci non trovate,
stesse voci toccate da più proposte, tariffe incerte fra due voci del
prezzario, con i due codici).

## Stadio 2 — Bozza (`2_bozza.md`)

Per ogni voce dell'elenco approvato una riga:

| N. | Tariffa | Voce di progetto sostituita | Descrizione della lavorazione offerta | U.M. | Quantità | Rif. progetto | Criterio / sub-criterio (come nel disciplinare) |
|---|---|---|---|---|---|---|---|

- «Tariffa» = quella approvata nell'elenco delle voci (codice del
  prezzario così come è nel database, o `NP.OT.nnn`).
- In fondo alla bozza, la sezione **«## Elenco delle tariffe»**, una
  riga per tariffa usata, in ordine di prima comparsa:

  | Tariffa | Fonte | Descrizione della voce di riferimento | U.M. |
  |---|---|---|---|
  | CAM26_E.05.020.010.B | Prezzario Regione Campania 2026 | [descrizione ridotta della voce del prezzario] | mq |
  | NP.OT.001 | Nuovo prezzo | [descrizione estesa completa del nuovo prezzo] | mq |

  Fonte con il nome del prezzario come lo restituisce
  `versione_prezzario`. Nessun prezzo in questa tabella, neanche nel
  computo estimativo (lì il prezzo sta nella colonna della voce).
- Scrivi anche `analisi_nuovi_prezzi.md` (vedi «Tariffa di riferimento
  per ogni voce»), una sezione per nuovo prezzo; se non ce ne sono,
  il file dice «Nessun nuovo prezzo».

- La descrizione dice cosa si offre in più rispetto al progetto (marca,
  classe, prestazione, controllo), coerente con la relazione tecnica e
  senza nomi commerciali se non richiesti.
- «Rif. progetto» = voce e nome dell'elaborato come caricato; nessun
  codice di proposta: la proposta si riconosce dalla descrizione.
- Quantità = quella di progetto, salvo che la proposta la modifichi in
  modo documentato.
- Estimativo: aggiungi Prezzo unitario, Importo, Fonte prezzo.
- Variante B: tutte le voci del progetto in ordine di computo, colonna
  «Rimodulata» (sì/no).

## Stadio 3 — Definitivo (`3_definitivo.md`)

```markdown
# [nome del documento come da disciplinare]
[Premessa di 2-3 righe: riferimento all'articolo del disciplinare e,
se non estimativo, «Il presente computo non contiene prezzi né importi».]

## Criterio [n] — [denominazione del disciplinare]
### [n.m] — [denominazione del sub-criterio]
| N. | Tariffa | Voce di progetto sostituita | Descrizione della lavorazione offerta | U.M. | Quantità | Rif. progetto | Criterio / sub-criterio |
|---|---|---|---|---|---|---|---|

## Elenco delle tariffe
| Tariffa | Fonte | Descrizione della voce di riferimento | U.M. |
|---|---|---|---|

## Riepilogo
| Criterio (come nel disciplinare) | Lavorazioni migliorate | Voci |
```

Le tabelle sono lette dal convertitore PriMus: mantieni titoli
`## Criterio X — …` e `### X.n — …`, le intestazioni di colonna così
come sono, una voce per riga, la quantità come numero all'inizio della
cella (`2,55` o `2,55 (come da computo di progetto)`; `TBD` solo se
davvero da definire). Estimativo: aggiungi le colonne «Prezzo
unitario» e «Importo» dopo «Quantità».

Nessun contenuto nuovo rispetto alla bozza approvata; controlla che
nessuna cifra economica sia rimasta (non estimativo), che ogni tariffa
della tabella sia nell'«Elenco delle tariffe» e che ogni proposta
citata esista e sia approvata.

## Richiesta di modifiche

Se il prompt contiene una RICHIESTA DI MODIFICHE, rileggi il file dello
stadio, applica solo ciò che la nota chiede e riscrivilo.
