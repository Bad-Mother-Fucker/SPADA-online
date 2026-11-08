# Costo orario della manodopera — tabelle ANCE per anno e provincia

Il professionista paga la manodopera delle analisi **con la tabella
ANCE dell'anno di riferimento**, non con la voce elementare del
prezzario regionale. Le associazioni territoriali ANCE pubblicano la
tabella del costo medio orario degli operai a ogni variazione
contrattuale (CCNL, integrativo provinciale, EVR, aliquote casse edili);
per Napoli la pubblica ACEN (ANCE Napoli) in
<https://acen.it/category/tabelle-manodopera/>, con un PDF per
aggiornamento. Il Ministero del Lavoro pubblica a parte, con decreto
direttoriale annuale, la tabella del costo medio orario per provincia
usata per la verifica di congruità (art. 41 c. 13 d.lgs. 36/2023): è
un riferimento diverso, di norma più basso perché fotografa i minimi di
un anno prima; qui si riporta solo come controllo.

Come si usa: scegli l'edizione in vigore alla **data di pubblicazione
del bando** per la provincia della stazione appaltante. Le tabelle ANCE
hanno due versioni, imprese fino a 15 dipendenti e oltre 15: usa quella
dell'impresa concorrente se la conosci (scheda impresa / manifest),
altrimenti **oltre 15 dipendenti** e scrivilo nella nota. Se l'edizione
dell'anno manca in questo file, usa l'ultima disponibile e scrivi nella
fonte «da aggiornare all'edizione in vigore alla data del bando».

Fonte da scrivere nella riga:
`tabella ANCE <Provincia> n. <tabella> (dal <decorrenza>), <fino a|oltre> 15 dip.`

Questo file è una **tabella viva**: a ogni nuova edizione si aggiunge
una sezione (provincia, decorrenza, numero tabella, link, valori). Le
correzioni del professionista a un costo orario passano prima da
`memoria/prezzi_appresi.json` (tipo `manodopera`) e, una volta
confermate, si riportano qui e si committano.

## Livelli

| Livello CCNL | Qualifica | Uso tipico nelle analisi |
|---|---|---|
| 4° livello | operaio di 4° livello (lavori speciali, capo squadra) | conduzione squadra, lavorazioni ad alta specializzazione |
| 3° livello | operaio specializzato | posa qualificata, impianti, finiture |
| 2° livello | operaio qualificato | assistenza alla posa, lavorazioni semplici qualificate |
| 1° livello | operaio comune | movimentazione, pulizia, aiuto |

I valori sono il **«Totale retribuzione ed oneri»** della tabella: costo
orario complessivo per l'impresa (retribuzione, oneri INPS/INAIL, Cassa
Edile, TFR, previdenza e sanità integrativa). Si usano così come sono,
senza maggiorazioni; le spese generali e l'utile li aggiunge il metodo
(15% e 10%).

## Napoli — tabella ANCE n. 373, in vigore dal 01/10/2026

Fonte: ACEN, «Nuove tabelle del costo della manodopera», 16/10/2026,
aggiornata al rinnovo del Contratto Integrativo Provinciale di Napoli del
1° ottobre 2026 — PDF
<https://acen.it/wp-content/uploads/2026/10/ANCE_Napoli_-_Tabella_manodopera_ottobre_2026.pdf>.
Ipotesi della tabella: operai a tempo pieno e indeterminato.

| Livello | Fino a 15 dip. (€/h) | Oltre 15 dip. (€/h) |
|---|---|---|
| 1° livello — operaio comune | 28,92 | 29,01 |
| 2° livello — operaio qualificato | 32,27 | 32,37 |
| 3° livello — operaio specializzato | 34,86 | 34,97 |
| 4° livello — operaio 4° liv. | 36,83 | 36,95 |

(Totale retribuzione, uguale nelle due versioni: 16,01 / 17,82 / 19,23 /
20,30 €/h; la differenza fra le due colonne è l'aliquota INPS, 33,68%
contro 34,28%.)

Fonte da scrivere: `tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip.`

### Controllo: tabella ministeriale 2026, Napoli, operai

D.D. Ministero del Lavoro 13 maggio 2026 n. 40 (sostituisce il D.D.
23/2026), intestata «Maggio 2025», decorrenza 13/05/2026: 1° liv.
27,60 · 2° liv. 30,82 · 3° liv. 33,28 · 4° liv. 35,17 €/h. Non si usa
nelle analisi (il professionista usa la tabella ANCE); serve a capire
quanto il costo ANCE in vigore stia sopra il riferimento di congruità
(circa +5%).

## Edizioni precedenti — Napoli

Pubblicate da ACEN nella stessa categoria (per gare con bando anteriore
al 01/10/2026, da trascrivere quando servono): tabelle marzo 2026
(minimi CCNL dal 01/03/2026 e accordo EVR 2026), gennaio 2026 (accordo
8/10/2025), ottobre 2025 (FNAPE 1,84%), febbraio 2025 (CCNL 2025-2028 ed
EVR 2025), gennaio 2025.

## Altre province

ACEN pubblica anche Avellino, Benevento, Caserta e Salerno (stessa
categoria, post separati). Per altre regioni: sito dell'ANCE
territoriale della provincia, sezione costo manodopera / tabelle paga.
Alla prima gara fuori Napoli: aggiungere qui la sezione con la stessa
struttura (provincia, numero tabella, decorrenza, link, quattro livelli,
due versioni).
