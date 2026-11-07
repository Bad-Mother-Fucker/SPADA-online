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
- per le proposte, il loro titolo descrittivo, mai il codice.

Gli elaborati di progetto (computo, capitolato, allegati, tavole) sono
**fonti da cui ricavare i contenuti**: se serve nominarne uno, si usa
solo il **titolo esteso**, senza sigla o codice dell'elaborato e senza
voce, articolo o pagina (es. «Elenco prezzi unitari», non «Allegato H –
Elenco prezzi unitari» né «Allegato H, p. 19»). Vedi «Stile del testo».

Unica eccezione: nella **scaletta** e nell'**elenco delle voci** (stadio
1, documenti di lavoro per il professionista) i codici interni si possono
usare per brevità. Dalla bozza in poi, mai. Alla fine di ogni stadio il
sistema controlla il testo: se trova codici interni ti chiede di
toglierli, e l'esportazione in DOCX/PDF li rifiuta.

## Stile del testo (bozza e definitivo)

La relazione è una **relazione descrittiva di progetto**, non un estratto
del computo o del capitolato. Dai documenti tecnici si ricavano i
contenuti, mai la forma: il testo deve essere discorsivo, chiaro e
scorrevole anche per chi non lavora nel settore.

**Non deve comparire:**
- codici delle voci di computo (es. 439/586, 444/591);
- sigle e codici degli elaborati (es. «Allegato G», «Allegato H –»,
  «PE-AR_08», «CSA»): se un elaborato va nominato, solo il titolo esteso
  («Computo metrico estimativo», «Elenco prezzi unitari»);
- pagine, articoli, paragrafi o capitoli da cui è presa l'informazione
  (es. «p. 19», «art. 4.1.10.15 del capitolato»);
- definizioni e classi del capitolato che non descrivono ciò che è
  previsto in progetto (fasce di misura non utilizzate, classi «extra»);
- parentesi usate per elencare dati, virgolette «», barre e
  abbreviazioni: «litri» e non «l», «230-250» e non «230/250»;
- lessico contabile: non «computato», «voce», «computo», ma «previsto» e
  «fornito»; «contabilizzato» solo dove serve davvero.

**Deve comparire sempre:**
- ogni elemento con il suo nome identificativo (per le piante il nome
  scientifico), ogni quantità, ogni misura (per gli alberi circonferenza
  del tronco, volume del contenitore, altezza di impalcatura), il tipo di
  fornitura (zolla o contenitore) e l'area di destinazione;
- le eccezioni alla regola generale, introdotte con formule come «ad
  eccezione di»;
- solo dati presenti nelle fonti: se un dato non è indicato (per esempio
  il contenitore di una specie) non si inventa e non si aggiunge.

**Come organizzare ogni blocco descrittivo:**
1. apri con le caratteristiche comuni a tutti gli elementi (dimensioni,
   modalità di fornitura, requisiti) e con le relative eccezioni;
2. passa al dettaglio raggruppato per area o per ambito, non nell'ordine
   in cui i dati compaiono nelle fonti; introducilo con «Nello specifico»
   e collega le parti con «invece» e «infine»;
3. chiudi riassumendo in una frase le lavorazioni accessorie (per
   esempio la messa a dimora), senza codici.

**Forma:**
- frasi complete e collegate tra loro: niente elenchi telegrafici tra
  parentesi o separati da punto e virgola;
- futuro per le prescrizioni («saranno fornite», «dovranno aver
  subito»), presente per descrivere il progetto («è prevista»,
  «presentano»);
- intervalli per esteso quando la frase scorre meglio («compresa tra 20 e
  25 cm»), altrimenti col trattino («16-18 cm»);
- quantità in cifre seguite dal nome («11 esemplari di Fraxinus ornus»),
  ma l'unità in lettere («un esemplare»);
- paragrafi brevi, uno per ogni blocco logico.

**Esempio.** Non così:

> Gli alberi del nucleo sono computati con circonferenza del tronco
> 20-25 cm (il Sorbus aucuparia, 16-18 cm), in zolla o in contenitore,
> con almeno tre trapianti in vivaio e altezza d'impalcatura non
> inferiore a 230/250 cm. Le voci dell'Allegato G – Computo metrico
> estimativo sono la 439/586 (Fraxinus ornus, 11, Area Eventi), la
> 440/587 (Quercus ilex, 3, contenitore 150 l), la 442/589 (Cercis
> siliquastrum, 5, contenitore 240 l), la 274/555 (Fraxinus ornus, 2,
> Area Mercatale), la 275/556 (Populus alba, 1, Area Mercatale), la
> 720/631 (Quercus pubescens, 3, contenitore 165 l, Casa del Metaverso) e
> la 721/632 (Sorbus aucuparia, 1, 16-18 cm, zolla, Casa del Metaverso);
> la messa a dimora è computata alle voci 444/591, 277/558 e 722/633
> («alberi 20-25 cm»). L'Allegato f2 – CSA parte II tecnica generale
> definisce all'art. 4.1.10.15 la classe «extra» (circonferenza oltre
> 25 cm, altezza oltre 2,5 m) e all'art. 4.1.10.14 la fascia 30-35 cm
> «con almeno tre trapianti».

Ma così:

> Gli alberi previsti per il nucleo presentano una circonferenza del
> tronco generalmente compresa tra 20 e 25 cm, ad eccezione del Sorbus
> aucuparia, per il quale è prevista una circonferenza di 16-18 cm. Le
> piante saranno fornite in zolla o in contenitore, dovranno aver subito
> almeno tre trapianti in vivaio e presentare un'altezza di impalcatura
> non inferiore a 230-250 cm.
>
> Nello specifico, nell'Area Eventi è prevista la messa a dimora di 11
> esemplari di Fraxinus ornus, 3 esemplari di Quercus ilex forniti in
> contenitore da 150 litri e 5 esemplari di Cercis siliquastrum in
> contenitore da 240 litri. Nell'Area Mercatale sono invece previsti 2
> esemplari di Fraxinus ornus e un esemplare di Populus alba. Per l'area
> destinata alla Casa del Metaverso sono infine previsti 3 esemplari di
> Quercus pubescens, forniti in contenitore da 165 litri, e un esemplare
> di Sorbus aucuparia, con circonferenza del tronco di 16-18 cm, fornito
> in zolla. Le relative operazioni di messa a dimora sono contabilizzate
> separatamente e riguardano complessivamente gli alberi con
> circonferenza del tronco di 20-25 cm.

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
   Fonti dei dati: [nome elaborato come caricato] sez./p. (solo per
   il professionista: nel testo non si citano)
   Indicatori: [valori misurabili da dichiarare]
   Vincolo del professionista: [nota, se approvata con modifiche]
   Figure: [fig-NN dell'elenco del prompt, se ce ne sono per questa proposta]
   Allegati: [sch-NN dell'elenco SCHEDE TECNICHE del prompt, se ce ne sono per questa proposta]
2. …
```

Controlli prima di chiudere lo stadio (scrivili in fondo, sezione
«Controlli»): ogni proposta approvata compare una volta sola; ogni nota
del professionista è assegnata a un paragrafo; somma facciate ≤ limite;
ogni subcriterio incluso ha almeno un paragrafo; criteri esclusi dalla
Sezione B assenti; ogni figura scelta dal professionista è assegnata a
un paragrafo e contata nelle facciate (mezza facciata, salvo il
disciplinare); ogni scheda tecnica scelta è assegnata a un paragrafo
(gli allegati non contano nelle facciate).

## Stadio 2 — Bozza (`2_bozza.md`)

Segui la scaletta approvata punto per punto: stessi titoli, stesso
ordine, parole obiettivo rispettate (±15%).

- `#` = criterio, `##` = sub-criterio, `###` = paragrafo/proposta, con
  numerazione e denominazione del disciplinare (es. «# Criterio 1 —
  Materiali ed impiantistica»). Ogni proposta dichiara
  in chiaro il criterio a cui si riferisce (lo chiede il disciplinare).
- Scrivi secondo «Stile del testo»: relazione descrittiva in prosa
  continua, comprensibile anche a chi non è del settore; elenchi solo
  per sequenze operative che non reggono in una frase.
- Elaborati nominati solo col titolo esteso, senza sigla, voce,
  articolo o pagina; nessun codice di nodo, wikilink o percorso interno
  (vedi «Regola di nomenclatura»): i dati delle fonti entrano nel testo,
  i loro riferimenti puntuali no.
- Titoli di criterio e sub-criterio come nel disciplinare; i paragrafi
  hanno il titolo descrittivo della proposta, mai il suo codice.
- Mai prezzi, importi, ribassi o elementi economici.
- Nessun fatto che non stia nei nodi proposta o nelle loro evidenze.
  Dove manca un dato: `%%DR_START: motivo%%` … `%%DR_END%%` (nel DOCX il
  testo diventa evidenziato giallo e il motivo un commento a margine) e non
  inventarlo.
- Figure: se il prompt elenca FIGURE scelte dal professionista, metti
  `[FIGURA: fig-NN]` su una riga a sé dopo il capoverso che la introduce
  e citala come «figura N» (N = ordine di comparsa nel documento); la
  didascalia la aggiunge l'esportazione. Il segnaposto è l'unico codice
  ammesso nel testo. Senza figure scelte: nessun segnaposto di immagine.
- Allegati di prodotto: sono SOLO le schede dell'elenco SCHEDE TECNICHE
  del prompt, scelte dal professionista. Citale in linea con
  `[ALLEGATO: sch-NN]` (es. «… dalla scheda tecnica del pannello
  ([ALLEGATO: sch-03]).»); l'esportazione scrive «Allegato T.n». Non
  scrivere mai che è allegata una scheda, EPD, dichiarazione di
  prestazione, certificato o rapporto di prova che non sia in elenco:
  quei valori si dichiarano come requisiti dell'offerta, senza rimando.
- Salti pagina `<!-- PAGEBREAK -->`.

In un file a parte, `controllo_bozza.md`, la tabella
subcriterio | parole obiettivo | parole scritte | facciate stimate | esito.
Se un subcriterio è sotto dell'15%, completa prima di chiudere.

## Stadio 3 — Definitivo (`3_definitivo.md`)

Parte dalla bozza approvata (con le modifiche a mano del professionista):
- non aggiungere contenuti nuovi né proposte;
- uniforma terminologia e numerazione; elimina ripetizioni, sigle di
  elaborati, voci, articoli e pagine rimasti (gli elaborati restano solo
  col titolo esteso) e ogni residuo di forma da computo
  (vedi «Stile del testo»);
- mantieni i blocchi `%%DR_…%%` non ancora risolti, togli quelli che il
  professionista ha risolto nel testo;
- allinea i rimandi agli allegati all'elenco SCHEDE TECNICHE del prompt
  (può essere cambiato dopo la bozza): ogni scheda in elenco citata con
  `[ALLEGATO: sch-NN]`, nessun rimando a schede o certificati fuori elenco;
- verifica il limite di facciate: se lo superi, accorcia partendo dai
  subcriteri a priorità più bassa e scrivi cosa hai tagliato in
  `controllo_definitivo.md`;
- niente copertina (la aggiunge la conversione), niente indice se non
  richiesto dalla Sezione A.

## Richiesta di modifiche

Se il prompt contiene una RICHIESTA DI MODIFICHE, il file dello stadio
esiste già: rileggilo, applica solo ciò che la nota chiede e riscrivilo.
Non ripartire da zero e non toccare le parti non citate dalla nota.
