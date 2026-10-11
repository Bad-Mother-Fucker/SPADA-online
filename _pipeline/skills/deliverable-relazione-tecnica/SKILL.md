---
name: deliverable-relazione-tecnica
description: Usa quando devi produrre la relazione tecnica dell'offerta (deliverable di tipo relazione_tecnica, Fase 7). Procedimento in tre stadi approvati uno alla volta dal professionista — scaletta, bozza, definitivo — con file, struttura e controlli di ciascuno. Un solo documento per tutti i criteri.
---

# Skill — Relazione tecnica

## Principio

La relazione tecnica è **un documento unico** che copre tutti i criteri
inclusi nella Sezione B di `vincoli_offerta_tecnica.md`, nell'ordine dei
criteri del disciplinare. Non si scrive una relazione per criterio.

Si produce in tre stadi. Ogni sessione esegue **un solo stadio**, scrive
il suo file nella cartella del deliverable e si ferma: il professionista
lo legge nell'interfaccia, lo approva, lo modifica a mano o chiede
modifiche con una nota. Lo stadio successivo parte solo dopo
l'approvazione e deve seguire **fedelmente** il file approvato: se il
professionista lo ha modificato a mano, le sue modifiche sono vincolanti.

| Stadio | File | Cosa decide il professionista |
|---|---|---|
| 1. Scaletta | `1_scaletta.md` | struttura, ordine, spazio per proposta |
| 2. Bozza | `2_bozza.md` | contenuto e tono, paragrafo per paragrafo |
| 3. Definitivo | `3_definitivo.md` | testo da consegnare (poi DOCX/PDF dall'interfaccia) |

La conversione in DOCX e PDF la fa il sistema dal definitivo, con font e
corpo della Sezione A: **non scrivere script di conversione e non
generare file Word**.

## Fonti (leggi prima di ogni stadio)

| File | Cosa estrai |
|---|---|
| `vincoli_offerta_tecnica.md` | Sezione A: limite di facciate, font, corpo, interlinea, elementi non computati, prescrizioni redazionali. Sezione B: criteri inclusi, budget di facciate per subcriterio, priorità, proposte per subcriterio, note strategiche |
| `output/03_criteria/criteria_matrix.md` | titoli e punti di criteri e subcriteri, elementi premianti |
| `02_graph/proposals/P-*.md` | ogni proposta approvata: testo, evidenze, `feedback_professionista`, `stato` (`approvata_con_modifiche` = la nota è un vincolo di redazione), `origine: professionista` (testo da riportare come scritto) |
| `output/06_registers/decisioni_professionista.md` | decisione e nota su ogni proposta |
| `output/07_questions/risposte_professionista.md` | tono e indicazioni strategiche (Fase 4) |
| `output/05_criteria_outputs/Cx_output.md` | dettaglio tecnico, indicatori, rischi, solo se il nodo non basta |

Una proposta scartata non entra. Una proposta senza nodo nel grafo non
entra: segnalala in fondo al file dello stadio, sezione «Da verificare».

## Stima delle facciate

Parole per facciata, se la Sezione A non indica le righe:
corpo 12 pt ≈ 480 parole, corpo 11 pt ≈ 550, corpo 10 pt ≈ 620
(interlinea singola o 1,15). Se indica le righe per facciata:
righe × 12 parole. Il totale non supera mai il limite della Sezione A.

## Stadio 1 — Scaletta (`1_scaletta.md`)

```markdown
# Scaletta della relazione tecnica — [nome gara]

| Criterio | Subcriterio | Punti | Facciate | Parole obiettivo | Proposte |
|---|---|---|---|---|---|
| C1 | C1.1 — [titolo] | 25 | 9 | ~4.950 | P-C1-001, P-C1-002 |
**Totale:** [N] facciate su [limite] · ~[parole] parole

## Premessa (~[N] righe, facoltativa)
Contenuto: [cosa dice, in una riga]

## Criterio C1 — [titolo] ([punti] pt)
### C1.1 — [titolo subcriterio] ([facciate] facc · ~[parole] parole)
1. **[Titolo paragrafo]** — P-C1-001 · ~[parole] parole
   Contenuto: [cosa si dichiara, su quali voci di computo/elaborati]
   Evidenze da citare: [[codice-elaborato]] sez./p.
   Indicatori: [valori misurabili da dichiarare]
   Vincolo del professionista: [nota, se approvata con modifiche]
2. …
```

Controlli prima di chiudere lo stadio (scrivili in fondo, sezione
«Controlli»): ogni proposta approvata compare una volta sola; ogni nota
del professionista è assegnata a un paragrafo; somma facciate ≤ limite;
ogni subcriterio incluso ha almeno un paragrafo; criteri esclusi dalla
Sezione B assenti.

## Stadio 2 — Bozza (`2_bozza.md`)

Segui la scaletta approvata punto per punto: stessi titoli, stesso
ordine, parole obiettivo rispettate (±15%).

- `#` = criterio («# Criterio C1 — Materiali ed impiantistica»),
  `##` = subcriterio, `###` = paragrafo/proposta. Ogni proposta dichiara
  in chiaro il criterio a cui si riferisce (lo chiede il disciplinare).
- Prima persona plurale, registro tecnico, prosa continua; elenchi solo
  per indicatori e sequenze operative.
- Cita gli elaborati con la loro nomenclatura (es. «voce 116 del
  computo metrico estimativo», «tav. 22»), mai con i nomi dei file.
- Mai prezzi, importi, ribassi o elementi economici.
- Nessun fatto che non stia nei nodi proposta o nelle loro evidenze.
  Dove manca un dato: `%%DR_START: motivo%%` … `%%DR_END%%` (nel DOCX
  diventa evidenziato giallo) e non inventarlo.
- Segnaposti: `[IMMAGINE: descrizione]`; salti pagina `<!-- PAGEBREAK -->`.

In un file a parte, `controllo_bozza.md`, la tabella
subcriterio | parole obiettivo | parole scritte | facciate stimate | esito.
Se un subcriterio è sotto dell'15%, completa prima di chiudere.

## Stadio 3 — Definitivo (`3_definitivo.md`)

Parte dalla bozza approvata (con le modifiche a mano del professionista):
- non aggiungere contenuti nuovi né proposte;
- uniforma terminologia, numerazione e rimandi; elimina ripetizioni;
- mantieni i blocchi `%%DR_…%%` non ancora risolti, togli quelli che il
  professionista ha risolto nel testo;
- verifica il limite di facciate: se lo superi, accorcia partendo dai
  subcriteri a priorità più bassa e scrivi cosa hai tagliato in
  `controllo_definitivo.md`;
- niente copertina (la aggiunge la conversione), niente indice se non
  richiesto dalla Sezione A.

## Richiesta di modifiche

Se il prompt contiene una RICHIESTA DI MODIFICHE, il file dello stadio
esiste già: rileggilo, applica solo ciò che la nota chiede e riscrivilo.
Non ripartire da zero e non toccare le parti non citate dalla nota.
