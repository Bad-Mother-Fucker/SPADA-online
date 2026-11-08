# Fonti dei costi — dove cercare, in che ordine, come citare

Un'analisi prezzi vale quanto le sue fonti. Ogni costo unitario porta
nella colonna «Fonte» una stringa che chi legge può verificare. L'ordine
qui sotto è una gerarchia: scendi di livello solo quando il precedente
non ha il dato.

## 0. Manodopera: tabella ANCE dell'anno

Per il costo orario degli operai la fonte è una sola: la tabella ANCE
(o ministeriale) dell'anno di riferimento per la provincia della gara,
in `manodopera_ance.md`, scelta con `scripts/aggiorna_manodopera.py
applicabile --data-bando … --provincia …` (che, se serve, scarica
l'edizione nuova dal sito ANCE e la propone «DA CONFERMARE»). Il
prezzario regionale pubblica anche voci di manodopera, ma il
professionista non le usa: non mescolare. Fonte da scrivere: `tabella
ANCE <Provincia> n. <n> (dal <gg/mm/aaaa>), oltre 15 dip.`; se
l'edizione è «DA CONFERMARE» o il controllo online è fallito, lo dici
nella fonte e in «Da verificare».

## 1. Voce elementare del prezzario della gara

Il prezzario regionale (server MCP `prezzario`, regione e anno esatti
indicati nel prompt della fase) pubblica, oltre alle lavorazioni
composte, le **voci elementari**: materiali a piè d'opera, noli di mezzi
e attrezzature, trasporti (e manodopera, che però qui non si usa — vedi
sopra). Sono la fonte più forte per materiali e noli perché la stazione
appaltante le riconosce senza discussione.

Come cercarle:

```
cerca_voce(testo="nolo piattaforma aerea", regione="Campania", anno=2026)
cerca_voce(testo="profilo alluminio anodizzato", regione="Campania", anno=2026)
cerca_voce(testo="pannello HPL", regione="Campania", anno=2026, limite=20)
```

Più ricerche con termini diversi (materiale, funzione, sinonimi
tecnici) prima di concludere che una voce non esiste. Leggi l'articolo
esteso: la variante giusta (lettera finale del codice) dipende da
spessore, classe, dimensione. `dettaglio_analisi` su una voce elementare
restituisce `voce_elementare: true` con prezzo e U.M.: è la conferma che
puoi usarla come componente.

Fonte da scrivere: `prezzario <Regione> <anno> — <codice>` (es.
`prezzario Campania 2026 — CAM26_M.01.010.010.A`).

## 2. Scomposizione della voce analoga

`dettaglio_analisi(codice_tariffa, regione, anno)` sulla voce del
prezzario più vicina alla lavorazione restituisce i componenti ordinati
(categoria, voci con codice, U.M., quantità per unità, prezzo unitario,
importo). È il modello della tua analisi: quantità e codici elementari
li riusi tali e quali per le parti che non cambiano. Attenzione:
`componenti` è una **lista ordinata** e la stessa categoria può
comparire più volte (fasi diverse della stessa voce): leggila riga per
riga, non aggregare per nome di categoria.

Fonte da scrivere: `analisi prezzario <codice analogo>, componente
<codice elementare>` oppure, per una quantità, `quantità da analisi
prezzario <codice analogo>`.

## 3. Memoria della skill (prezzi appresi)

`memoria/prezzi_appresi.json`: prezzi confermati o corretti dal
professionista in gare precedenti. Valgono pienamente se stessa
regione e meno di 12 mesi; altrimenti sono un ordine di grandezza da
marcare «da riverificare» nelle note. Fonte da scrivere: `prezzo
confermato dal professionista — gara <slug>, <data>`.

## 4. Documenti della gara e indicazioni del professionista

- Elenco prezzi e analisi prezzi **di progetto** (`input/`, schede in
  `output/04_doc_summaries/`, nodi in `02_graph/nodes/`): spesso
  contengono già nuovi prezzi di progetto con analisi; componenti e
  percentuali di quelle analisi sono una fonte della gara.
- Preventivi, listini, schede tecniche allegati dal professionista
  (`input/`): prezzo di fornitura, consumi, tempi di posa.
- Risposte del professionista nella Fase 4
  (`output/07_questions/risposte_professionista.md`) e note degli stadi
  approvati.

Fonte da scrivere: `elenco prezzi di progetto, voce <n>` / `preventivo
<fornitore> del <data>` / `scheda tecnica <prodotto>` / `indicazione del
professionista (Fase 4, D-…)`.

## 5. Stima dichiarata

Quando nessun livello ha il dato, **stimi tu** — mai `TBD`, mai una
casella vuota: il professionista vuole un'analisi completa da correggere,
non un modulo da compilare, e dà per inteso che ogni voce la verificherà.
La stima va fatta bene e chiamata col suo nome:

- parti da qualcosa: listini pubblici dei produttori per quel materiale,
  il prezzo della voce analoga del prezzario scalato per la differenza
  di prestazione, un'analisi approvata in memoria di un'altra regione o
  di un altro anno (ordine di grandezza), il rapporto tipico fra
  materiale e posa in lavorazioni simili;
- scrivi la fonte come `stima — <su cosa si basa>` (es. `stima —
  listini produttori HPL compatto 13 mm, 55–70 €/m²`, `stima — voce
  CAM26_… × 1,8 per nucleo pieno`), così chi legge sa quanto fidarsi;
- metti la riga in «Da verificare» con cosa servirebbe per confermarla
  (un preventivo, una scheda tecnica, una conferma del professionista).

La testata dell'analisi conta le stime; `verifica` le elenca come
avvisi. Non è un difetto dell'analisi: è la sua parte da leggere per
prima.

## Mai

- Un prezzo inventato presentato con una fonte vaga o che suona
  ufficiale («prezzi di mercato», «indagine di mercato»): una stima si
  chiama `stima — …` e dice su cosa si basa. È l'unico errore vero di
  un'analisi: il numero sbagliato si corregge, il numero travestito no.
- `TBD`, «da definire», caselle vuote: il metodo non li ammette.
- Un codice di prezzario citato senza averlo verificato con
  `cerca_voce` o `dettaglio_analisi` nella stessa sessione.
- Un prezzo del prezzario di un'altra regione o di un altro anno al
  posto di quello della gara.
- Trascrivere prezzi del prezzario in un computo **non estimativo**:
  restano in `analisi_nuovi_prezzi.*`, documenti di lavoro.

## Prezzario non disponibile

Se il prompt dice che il prezzario della gara non è importato: nessuna
voce elementare, nessuna analisi analoga, nessun `confronta_prezzo`.
Costruisci comunque l'analisi completa: manodopera dalla tabella ANCE
(non dipende dal prezzario), materiali e noli con stime dichiarate
(`stima — prezzario non disponibile; …`) e tutte in «Da verificare»,
con in testa la nota che l'analisi va riverificata dopo l'importazione
(`./spada importa-prezzario <Regione> <anno>`). Non sostituire con il
prezzario di un'altra regione.
