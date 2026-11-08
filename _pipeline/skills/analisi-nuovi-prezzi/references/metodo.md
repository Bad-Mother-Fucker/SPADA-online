# Il metodo — analisi prezzo di una nuova voce

Fonte: indicazioni del professionista (Giacomo, Studio NEA) e il suo
foglio `assets/ANALISI_NUOVI_PREZZI_METODO.xls`. Questo file è la
versione «spiegata»: cosa va in ogni sezione, perché, e come si chiude
il conto. Le regole promosse dalla memoria (vedi SKILL.md,
«Apprendimento») si aggiungono in fondo, nella sezione «Regole
consolidate», con data e provenienza.

## Struttura di un'analisi

```
CODICE NUOVO PREZZO          NP.OT.001
DESCRIZIONE                  sintetica — estesa (lavorazioni e materiali compresi)
U.M.                         quella della voce di computo

1. MANODOPERA                righe 1.1, 1.2 …      → totale 1   → incidenza %
2. MATERIALI                 righe 2.1, 2.2 …      → totale 2   → incidenza %
3. MEZZI D'OPERA             righe 3.1 …           → totale 3   → incidenza %
4. VARIE                     righe 4.1 …           → totale 4   → incidenza %
   SOMMANO (1+2+3+4)                               = TOTALE A
5.0 INCIDENZA SICUREZZA      3%  su TOTALE A                      → incidenza %
5.1 SPESE GENERALI           15% su TOTALE A                      → incidenza %
   SOMMANO (A + 5.0 + 5.1)                         = TOTALE B
6. UTILE DI IMPRESA          10% su TOTALE B                      → incidenza %
   TOTALE GENERALE           = B + 6
   PREZZO DI APPLICAZIONE    = TOTALE GENERALE arrotondato a 2 decimali, per U.M.
```

Ogni riga ha: numero, descrizione, U.M., quantità per unità di
lavorazione, costo unitario, importo (= quantità × costo unitario),
fonte. Ogni riga e ogni sezione hanno l'incidenza percentuale sul
prezzo di applicazione.

## 1. Manodopera

Una riga per **livello** di operaio impiegato, con le **ore per unità di
misura** della lavorazione (es. h/m²). I livelli seguono il CCNL edilizia
(tabelle ANCE / Ministero del Lavoro, costo medio orario per provincia):

| Livello | Figura tipica | Quando |
|---|---|---|
| 4° livello | operaio specializzato di 4° livello / capo squadra | lavorazioni di alta specializzazione, conduzione squadra |
| 3° livello | operaio specializzato | posa in opera qualificata, impianti, finiture |
| 2° livello | operaio qualificato | assistenza alla posa, lavorazioni semplici qualificate |
| 1° livello | operaio comune | movimentazione, pulizia, aiuto |

Il **costo orario** viene dalla **tabella ANCE dell'anno di riferimento**
per la provincia della gara (`manodopera_ance.md`; in sua assenza la
tabella ministeriale dello stesso anno, che è l'equivalente ufficiale).
Non dal prezzario regionale: il professionista ha scelto così, e un'analisi
che mescola le due fonti non è confrontabile con le sue. Il valore è il
costo complessivo per l'impresa: si usa così com'è.

Le ore sono una **stima ipotetica**: è così che le fa il professionista,
e così le fa la skill. Non esiste una fonte che le «dimostri»; esiste un
ragionamento che le rende difendibili. Ancore, in ordine: ore della voce
analoga del prezzario (`dettaglio_analisi`, sezione MANO D'OPERA, già per
unità); ore di un'analisi approvata in memoria per una lavorazione
simile; tempi di posa della scheda tecnica del produttore (`input/`, se
allegata). Poi correggi per ciò che la lavorazione offerta cambia
(formato, altezza, struttura, finitura) e scrivi il ragionamento in
`nota`: «squadra di 2, 0,6 h/m² ciascuno: tracciamento, struttura, posa
pannelli». Un numero con il suo ragionamento si corregge in un minuto;
un numero nudo si butta.

Una squadra tipica è specializzato + qualificato (o + comune): le ore
dei due livelli sono di norma uguali o quasi, perché lavorano insieme.
Un'analisi con un solo livello per una posa complessa è un segnale di
semplificazione eccessiva.

## 2. Materiali

**Tutti**, compresi quelli che un occhio frettoloso dimentica:

- il materiale principale (il motivo del nuovo prezzo: scrivi la
  caratteristica che il prezzario non copre — classe, spessore, marca
  se richiesta dal disciplinare, certificazione);
- i materiali di posa: collanti, malte, primer, fissaggi meccanici,
  tasselli, viti, profili, guarnizioni, sigillanti, nastri;
- i consumabili: dischi, punte, lame, teli di protezione;
- lo **sfrido**: **dentro la quantità**, mai come riga a sé (è così che
  lo fa il professionista): 1,08 m²/m² con «compreso sfrido 8%» nella
  descrizione. Ordini di grandezza: 5–10% per lastre e pannelli, 10–15%
  per rivestimenti con molti tagli, 2–3% per materiali sfusi;
- imballi, pallet, cauzioni se non compresi nel prezzo di fornitura.

Quantità sempre **per unità di lavorazione**: se il materiale si compra
in kg e la voce è in m², la riga dice il consumo (kg/m²) e la fonte del
consumo (scheda tecnica, voce analoga). Prezzi: voce elementare del
prezzario (sezione MATERIALI, con codice); altrimenti preventivo o
listino; altrimenti **una stima dichiarata** (`stima — …`): mai `TBD`,
mai una casella vuota (vedi `fonti.md`, «Stime»).

## 3. Mezzi d'opera

Attrezzature e mezzi necessari all'esecuzione: elettroutensili,
betoniera, piattaforma aerea, autocarro, gru, trabattello, ponteggio
(se non già a corpo nel progetto).

Il costo è **parametrato sulle ore della manodopera**: un mezzo usato
dall'operaio lavora quante ore lavora l'operaio (per unità), un mezzo
usato a intermittenza una frazione dichiarata. Costo orario = nolo dal
prezzario (sezione NOLI, voce elementare con codice) o da listino.

- **Nolo a freddo** (solo il mezzo): l'operatore è già conteggiato in
  manodopera. È il caso normale per utensili, trabattelli, piattaforme
  condotte dagli stessi operai.
- **Nolo a caldo** (mezzo + operatore): si usa quando l'operatore non è
  nella squadra (autogru con gruista, autocarro con autista). Allora
  non mettere quelle ore anche in manodopera: conteresti due volte.

Piccoli utensili e attrezzatura minuta si possono esprimere come
percentuale della manodopera (tipico 2–3%) in una riga «attrezzatura
minuta, % su manodopera», se il prezzario analogo fa così.

## 4. Varie ed eventuali

Ciò che non è né forza lavoro né materiale né mezzo, ma serve a
completare la lavorazione: trasporto a discarica e oneri di
conferimento, prove e certificazioni di cantiere, assistenze murarie
non comprese altrove, ripristini, protezioni di opere finite, oneri di
accesso. Spesso vuota: in quel caso la sezione riporta «nessuna» e
totale 0,00, così chi legge sa che è stata considerata e non
dimenticata.

## 5. Incidenze obbligatorie (su TOTALE A)

| Voce | % | Base | Perché |
|---|---|---|---|
| 5.0 Sicurezza | 3% | TOTALE A | oneri di sicurezza aziendali interni alla lavorazione (DPI, apprestamenti di dettaglio), distinti dagli oneri di sicurezza del PSC che il progetto computa a parte |
| 5.1 Spese generali | 15% | TOTALE A | costi di struttura dell'impresa (DPR 207/2010 art. 32 c. 2 lett. b: 13–17%; il metodo fissa il 15%) |

TOTALE B = A + 0,03 A + 0,15 A = **1,18 A**.

## 6. Utile d'impresa (su TOTALE B)

10% su TOTALE B (DPR 207/2010 art. 32 c. 2 lett. c). TOTALE GENERALE =
1,10 B = **1,298 A**. Il PREZZO DI APPLICAZIONE è il totale generale
arrotondato a 2 decimali, riferito all'unità di misura.

### Le percentuali non cambiano

3% / 15% / 10% sono il metodo del professionista e valgono **sempre**:
anche quando il prezzario regionale dichiara altre percentuali nei
campi `spese_generali_pct` e `utili_impresa_pct`, anche quando le
analisi prezzi di progetto ne usano altre. Non adattarle. Il 3% di
sicurezza si somma sempre, anche se il progetto computa a parte gli
oneri di sicurezza del PSC: sono oneri aziendali interni alla
lavorazione, non apprestamenti di cantiere. Se un documento di gara
imponesse esplicitamente percentuali diverse per le analisi dell'offerta,
segnalalo in «Da verificare» e lascia decidere al professionista:
`verifica` rifiuta parametri diversi da questi, quindi un'eventuale
eccezione la autorizza lui, non la skill.

## 7. Incidenze percentuali

Per ogni riga, sezione, incidenza obbligatoria e utile:
`incidenza = importo / prezzo di applicazione × 100`, 2 decimali. La
somma di tutte le incidenze di primo livello (sezioni 1–4, 5.0, 5.1, 6)
è 100,00 ± 0,05.

L'**incidenza della manodopera** va nel riepilogo in evidenza: è il dato
richiesto dall'art. 23 c. 16 del Codice (costo della manodopera
individuato nel progetto) e dalla verifica di congruità, e nel prezzario
ogni voce la dichiara (`manodopera_diretta_incidenza`): confronta la tua
con quella della voce analoga.

## Controllo aritmetico (checklist senza script)

1. Ogni riga: importo = quantità × costo unitario, arrotondato a 2
   decimali (±0,01).
2. Totale di sezione = somma degli importi delle righe (tutte: non ci
   sono righe senza costo).
3. TOTALE A = T1 + T2 + T3 + T4.
4. 5.0 = A × 3%; 5.1 = A × 15% (o le percentuali della gara).
5. TOTALE B = A + 5.0 + 5.1.
6. 6 = B × 10%.
7. TOTALE GENERALE = B + 6; PREZZO DI APPLICAZIONE = arrotondato a 2
   decimali.
8. Incidenze: ogni importo / prezzo di applicazione × 100; somma delle
   incidenze di primo livello = 100,00 ± 0,05.
9. Verifica rapida: prezzo di applicazione ≈ A × 1,298 (con le
   percentuali standard). Se non torna, hai sbagliato una base.

## Segnali di errore

- Manodopera sotto il 10% in una lavorazione di posa, o sopra il 60% in
  una fornitura e posa di materiale costoso.
- Materiale principale senza sfrido.
- Mezzo d'opera con ore maggiori della somma delle ore di manodopera
  (salvo nolo a corpo o a giornata, da dichiarare).
- Unità di misura del materiale diversa da quella della voce senza riga
  di conversione.
- Prezzo di applicazione con scostamento ALTO dalla voce analoga
  (`confronta_prezzo`) senza una spiegazione nelle note.
- Un numero senza fonte, o una stima presentata come dato («prezzi di
  mercato» non è una fonte: `stima — listini produttori X` lo è).
- Una riga di sfrido separata, una percentuale diversa da 3/15/10, un
  costo orario preso dal prezzario invece che dalla tabella ANCE.

## Regole consolidate

Regole promosse da `memoria/lezioni.md` dopo conferme ripetute. Si
aggiungono qui con data, gare di provenienza e numero di conferme; si
rimuovono solo se il professionista le smentisce.

_(nessuna ancora)_
