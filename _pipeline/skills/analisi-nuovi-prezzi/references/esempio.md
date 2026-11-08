# Esempio svolto — un nuovo prezzo dalla bozza all'approvazione

Lo stesso nuovo prezzo in due momenti: come la skill lo ha generato allo
stadio bozza (con un costo stimato, dichiarato come tale) e come il
professionista lo ha approvato dopo averlo corretto. In fondo, cosa la
skill ha imparato. I numeri sono prodotti da `scripts/analisi_np.py
rendi` sul JSON di `formato_output.md`: usali come riferimento del
livello di dettaglio atteso, non come prezzi reali (il costo orario è la
tabella ANCE Napoli n. 373 dal 01/10/2026, i prezzi dei materiali sono di esempio).

## 1. Bozza generata dalla skill

# Analisi dei nuovi prezzi — Computo metrico delle migliorie — liceo-rossi-efficientamento

**Prezzario:** Campania 2026 · **Parametri:** sicurezza 3% e spese generali 15% su totale A, utile 10% su totale B (metodo standard) · **Stadio:** bozza · **Generato:** 2026-11-08
**Documento di lavoro per il professionista: non va nella busta tecnica** (computo non estimativo: nessun prezzo di questo file compare negli altri documenti del computo).

> 1 costo stimato dalla skill (fonte «stima — …»), elencati in «Da verificare» di ciascuna analisi. Tutte le voci si intendono da verificare dal professionista.

## NP.OT.001 — Pareti divisorie in pannelli HPL compatto a nucleo pieno sp. 13 mm su struttura in alluminio

**U.M.:** m² · **Proposta:** Pareti divisorie dei servizi in HPL compatto · **Criterio:** 1.1 — Qualità dei materiali · **Voce di computo:** 29 — 9_CME_Computo_Metrico_Estimativo · **Voce analoga del prezzario:** CAM26_R02.090.070.C (95,10 €/m²)

**Descrizione estesa.** Fornitura e posa in opera di pareti divisorie per servizi igienici in pannelli di laminato HPL compatto a nucleo pieno, spessore 13 mm, classe di reazione al fuoco B-s2,d0, bordi arrotondati, su struttura portante in profili di alluminio anodizzato con piedini regolabili; comprese ferramenta in acciaio inox, serrature libero/occupato, tracciamento, tagli, sfridi, fissaggi, pulizia finale. Esclusa la demolizione delle pareti esistenti.

| N. | Descrizione | U.M. | Quantità | Costo unitario | Importo | Incidenza | Fonte |
|---|---|---|---|---|---|---|---|
| **1.** | **MANODOPERA** | | | | | | |
| 1.1 | Operaio specializzato (3° livello) | h | 0,600 | 34,97 | 20,98 | 12,41% | tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip. |
| 1.2 | Operaio qualificato (2° livello) | h | 0,600 | 32,37 | 19,42 | 11,49% | tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip. |
| | *Totale 1 — Manodopera* | | | | **40,40** | **23,89%** | |
| **2.** | **MATERIALI** | | | | | | |
| 2.1 | Pannello HPL compatto nucleo pieno sp. 13 mm, classe B-s2,d0, compreso sfrido 8% | m² | 1,080 | 62,00 | 66,96 | 39,60% | stima — listini produttori HPL compatto 13 mm (55–70 €/m²), nessuna voce elementare nel prezzario |
| 2.2 | Profili in alluminio anodizzato per struttura e fissaggio | m | 3,200 | 6,80 | 21,76 | 12,87% | prezzario Campania 2026 — CAM26_P01.010.040.B |
| | *Totale 2 — Materiali* | | | | **88,72** | **52,47%** | |
| **3.** | **MEZZI D'OPERA** | | | | | | |
| 3.1 | Attrezzatura minuta ed elettroutensili (nolo a freddo) | h | 0,600 | 1,90 | 1,14 | 0,67% | prezzario Campania 2026 — CAM26_N.01.020.010.A |
| | *Totale 3 — Mezzi d'opera* | | | | **1,14** | **0,67%** | |
| **4.** | **VARIE** | | | | | | |
| 4.1 | nessuna | | | | 0,00 | 0,00% | |
| | *Totale 4 — Varie* | | | | **0,00** | **0,00%** | |
| | **TOTALE A (1+2+3+4)** | | | | **130,26** | **77,04%** | |
| 5.0 | Incidenza sicurezza 3% su totale A | | | | 3,91 | 2,31% | |
| 5.1 | Spese generali 15% su totale A | | | | 19,54 | 11,56% | |
| | **TOTALE B (A + 5.0 + 5.1)** | | | | **153,71** | | |
| 6. | Utile d'impresa 10% su totale B | | | | 15,37 | 9,09% | |
| | **TOTALE GENERALE** | | | | **169,08** | **100,00%** | |
| | **PREZZO DI APPLICAZIONE** | €/m² | | | **169,08** | | |

**Incidenze:** manodopera 23,89% · materiali 52,47% · mezzi d'opera 0,67% · varie 0,00% · sicurezza 2,31% · spese generali 11,56% · utile 9,09%.
**Confronto con la voce analoga:** CAM26_R02.090.070.C, 95,10 €/m² → scostamento +77,79% (ALTO). Il pannello HPL a nucleo pieno costa circa il doppio del laminato della voce di prezzario; la posa è analoga.

**Note**
- Ore di posa da analisi prezzario CAM26_R02.090.070.C (0,55 h/m² per livello), maggiorate a 0,60 per il tracciamento su struttura.

**Da verificare**
- 2.1 — prezzo del pannello HPL stimato da listini: confermare con un preventivo del fornitore.

## 2. Analisi approvata dal professionista

Il professionista ha: portato le ore dei due livelli da 0,600 a 0,750
h/m² («la posa su struttura con piedini regolabili richiede livellamento
e tracciamento»); sostituito la stima del pannello (62,00) con il prezzo
del preventivo del fornitore (68,00 €/m²); aggiunto la riga 2.3
«Ferramenta inox» che la skill aveva dimenticato (era citata nella
descrizione estesa ma non nelle righe: incoerenza classica). La sezione
approvata:

## NP.OT.001 — Pareti divisorie in pannelli HPL compatto a nucleo pieno sp. 13 mm su struttura in alluminio

**U.M.:** m² · **Proposta:** Pareti divisorie dei servizi in HPL compatto · **Criterio:** 1.1 — Qualità dei materiali · **Voce di computo:** 29 — 9_CME_Computo_Metrico_Estimativo · **Voce analoga del prezzario:** CAM26_R02.090.070.C (95,10 €/m²)

**Descrizione estesa.** Fornitura e posa in opera di pareti divisorie per servizi igienici in pannelli di laminato HPL compatto a nucleo pieno, spessore 13 mm, classe di reazione al fuoco B-s2,d0, bordi arrotondati, su struttura portante in profili di alluminio anodizzato con piedini regolabili; comprese ferramenta in acciaio inox, serrature libero/occupato, tracciamento, tagli, sfridi, fissaggi, pulizia finale. Esclusa la demolizione delle pareti esistenti.

| N. | Descrizione | U.M. | Quantità | Costo unitario | Importo | Incidenza | Fonte |
|---|---|---|---|---|---|---|---|
| **1.** | **MANODOPERA** | | | | | | |
| 1.1 | Operaio specializzato (3° livello) | h | 0,750 | 34,97 | 26,23 | 12,33% | tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip. |
| 1.2 | Operaio qualificato (2° livello) | h | 0,750 | 32,37 | 24,28 | 11,41% | tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip. |
| | *Totale 1 — Manodopera* | | | | **50,51** | **23,73%** | |
| **2.** | **MATERIALI** | | | | | | |
| 2.1 | Pannello HPL compatto nucleo pieno sp. 13 mm, classe B-s2,d0, compreso sfrido 8% | m² | 1,080 | 68,00 | 73,44 | 34,51% | preventivo Abet Laminati del 05/11/2026 |
| 2.2 | Profili in alluminio anodizzato per struttura e fissaggio | m | 3,200 | 6,80 | 21,76 | 10,23% | prezzario Campania 2026 — CAM26_P01.010.040.B |
| 2.3 | Ferramenta inox: cerniere, pomoli, serrature libero/occupato | cad | 0,450 | 38,00 | 17,10 | 8,04% | preventivo Abet Laminati del 05/11/2026 |
| | *Totale 2 — Materiali* | | | | **112,30** | **52,77%** | |
| **3.** | **MEZZI D'OPERA** | | | | | | |
| 3.1 | Attrezzatura minuta ed elettroutensili (nolo a freddo) | h | 0,600 | 1,90 | 1,14 | 0,54% | prezzario Campania 2026 — CAM26_N.01.020.010.A |
| | *Totale 3 — Mezzi d'opera* | | | | **1,14** | **0,54%** | |
| **4.** | **VARIE** | | | | | | |
| 4.1 | nessuna | | | | 0,00 | 0,00% | |
| | *Totale 4 — Varie* | | | | **0,00** | **0,00%** | |
| | **TOTALE A (1+2+3+4)** | | | | **163,95** | **77,04%** | |
| 5.0 | Incidenza sicurezza 3% su totale A | | | | 4,92 | 2,31% | |
| 5.1 | Spese generali 15% su totale A | | | | 24,59 | 11,55% | |
| | **TOTALE B (A + 5.0 + 5.1)** | | | | **193,46** | | |
| 6. | Utile d'impresa 10% su totale B | | | | 19,35 | 9,09% | |
| | **TOTALE GENERALE** | | | | **212,81** | **100,00%** | |
| | **PREZZO DI APPLICAZIONE** | €/m² | | | **212,81** | | |

**Incidenze:** manodopera 23,73% · materiali 52,77% · mezzi d'opera 0,54% · varie 0,00% · sicurezza 2,31% · spese generali 11,55% · utile 9,09%.
**Confronto con la voce analoga:** CAM26_R02.090.070.C, 95,10 €/m² → scostamento +123,77% (ALTO). Il pannello HPL a nucleo pieno costa circa il doppio del laminato della voce di prezzario; la posa è analoga.

**Note**
- Ore di posa da analisi prezzario CAM26_R02.090.070.C (0,55 h/m² per livello), maggiorate a 0,60 per il tracciamento su struttura.

## 3. Cosa ha imparato la skill (`analisi_np.py apprendi --archivia`)

Dal confronto fra `_generato/analisi_nuovi_prezzi.json` e il JSON
approvato lo script ha prodotto quattro lezioni candidate (accodate in
`memoria/lezioni.md`, sezione «In attesa di rifinitura»), registrato il
prezzo del pannello in `memoria/prezzi_appresi.json` (con la nota che la
skill aveva stimato 62,00: la stima era bassa del 9%) e archiviato
l'analisi in `memoria/analisi_approvate/`. Le candidate, **rifinite**
dalla skill nella sessione successiva (il perché viene dalla nota del
professionista, lo script non può saperlo):

```markdown
## Manodopera
- [2026-11-08 · gara liceo-rossi-efficientamento · bozza→approvato] **Pannellature su struttura con piedini regolabili**: ore portate da 0,600 a 0,750 h/m² per livello («richiede livellamento e tracciamento»). Regola: per pareti divisorie prefabbricate su struttura regolabile stimare 0,70–0,80 h/m² per livello, non le 0,55 della voce di prezzario per pannelli a parete. (confermata 1×)

## Materiali
- [2026-11-08 · gara liceo-rossi-efficientamento · bozza→approvato] **Pareti divisorie per servizi**: aggiunta la riga «Ferramenta inox: cerniere, pomoli, serrature libero/occupato» (0,45 cad/m²). Regola: in ogni lavorazione con ante o porte la ferramenta è una riga a sé; se la descrizione estesa la cita, le righe devono contenerla. (confermata 1×)
- [2026-11-08 · gara liceo-rossi-efficientamento · bozza→approvato] **Stime HPL compatto**: la stima da listini (62) era sotto il preventivo reale (68) del 9%. Regola: per HPL compatto a nucleo pieno 13 mm stimare nella parte alta del range di listino. (confermata 1×)
```

La candidata sul prezzo è diventata sia un dato (`prezzi_appresi.json`)
sia una lezione, perché insegna come stimare, non solo quanto costa. La
quarta era un duplicato della prima (stessa correzione sull'altro
livello) ed è stata fusa.

Alla gara successiva, con una parete divisoria simile, la skill:
trova l'analisi archiviata con `grep -il "divisorie" memoria/analisi_approvate/*`
e la usa come modello; parte da 0,75 h/m²; mette la ferramenta fra i
materiali; usa 68,00 €/m² per il pannello se la gara è in Campania e
sono passati meno di 12 mesi (fonte: «prezzo confermato dal
professionista — gara liceo-rossi, 2026-11»), altrimenti lo cita come
ordine di grandezza in una stima dichiarata.
