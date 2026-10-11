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
| 1. Elenco delle voci | `1_voci.md` | quali lavorazioni entrano e da dove vengono le quantità |
| 2. Bozza del computo | `2_bozza.md` | descrizioni, quantità, unità di misura |
| 3. Definitivo | `3_definitivo.md` | documento da consegnare (DOCX/PDF dall'interfaccia) |

Non generare file Word né script: la conversione la fa il sistema.

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
importo, totale economico, sconto o rimando a voci di prezzario con
prezzo**, in nessuno stadio (l'inserimento è causa di esclusione). Non
consultare il prezzario. Solo se il vincolo chiede esplicitamente un
computo estimativo si usano i prezzi (progetto base o server MCP
`prezzario` della regione/anno della gara, mai a occhio: `TBD`).

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
| Voce di progetto | Descrizione di progetto (sintesi) | U.M. | Q.tà di progetto | Intervento | Fonte quantità |
|---|---|---|---|---|---|
| 116 | Consolidamento murature con rete PRFV | mq | 420,52 | miglioramento qualitativo | CME voce 116 |
```

Variante B: in più, l'elenco delle categorie del computo di progetto e
il numero di voci invariate per categoria. In fondo: «Da verificare»
(proposte senza lavorazioni a computo collegate, voci non trovate,
stesse voci toccate da più proposte).

## Stadio 2 — Bozza (`2_bozza.md`)

Per ogni voce dell'elenco approvato una riga:

| N. | Voce | Descrizione della lavorazione offerta | U.M. | Quantità | Rif. progetto | Proposta |
|---|---|---|---|---|---|---|

- La descrizione dice cosa si offre in più rispetto al progetto (marca,
  classe, prestazione, controllo), coerente con la relazione tecnica e
  senza nomi commerciali se non richiesti.
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

## Criterio C1 — [titolo]
[tabella]

## Riepilogo
| Criterio | Proposte | Voci |
```

Nessun contenuto nuovo rispetto alla bozza approvata; controlla che
nessuna cifra economica sia rimasta (non estimativo) e che ogni proposta
citata esista e sia approvata.

## Richiesta di modifiche

Se il prompt contiene una RICHIESTA DI MODIFICHE, rileggi il file dello
stadio, applica solo ciò che la nota chiede e riscrivilo.
