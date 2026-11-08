---
name: analisi-nuovi-prezzi
description: >-
  Costruisce l'analisi prezzi di una nuova voce di computo metrico (nuovo
  prezzo NP.OT.nnn o voce di progetto da riprezzare) con il metodo del
  professionista — manodopera, materiali, mezzi d'opera, varie, sicurezza 3%
  e spese generali 15% sul totale A, utile 10% sul totale B, incidenza
  percentuale di ogni sottovoce — producendo analisi_nuovi_prezzi.md, il JSON
  gemello e il foglio Excel nel layout di riferimento. Usala ogni volta che un
  computo (stadio bozza o definitivo di deliverable-computo-metrico) contiene
  una tariffa senza voce di prezzario compatibile, quando qualcuno chiede
  «analisi prezzo», «analisi nuovo prezzo», «quanto costa questa lavorazione»,
  «componi il prezzo di», «NP», «prezzo di applicazione», «incidenza
  manodopera», o quando il professionista corregge un'analisi già prodotta
  (la skill impara dalla correzione). Non usarla per scegliere il codice
  tariffa di una voce esistente, che è compito di deliverable-computo-metrico.
---

# Skill — Analisi dei nuovi prezzi

## A cosa serve

Quando una lavorazione offerta non è coperta da nessuna voce del
prezzario regionale, il computo la porta come **nuovo prezzo**
(`NP.OT.nnn`). Un nuovo prezzo senza analisi è un numero indifendibile:
la commissione, il RUP e il direttore dei lavori lo contestano. Questa
skill costruisce quel numero **dal basso**, sommando ciò che serve
davvero a eseguire un'unità della lavorazione, nel formato che il
professionista usa già (foglio `assets/ANALISI_NUOVI_PREZZI_METODO.xls`).

Il metodo in una riga: **prezzo = (manodopera + materiali + mezzi
d'opera + varie) × 1,18 × 1,10**, con l'incidenza di ogni sottovoce sul
prezzo finale. Il dettaglio è in `references/metodo.md`: leggilo la prima
volta e ogni volta che un passaggio non ti è chiaro.

## Quando entra in gioco

- **Stadio bozza del computo** (`deliverable-computo-metrico`): per ogni
  tariffa `NP.OT.nnn` dell'elenco delle voci approvato, un'analisi.
  È la skill che scrive `analisi_nuovi_prezzi.md` (e il suo JSON).
- **Stadio definitivo del computo**: nessuna analisi nuova; si legge
  l'analisi approvata, si **impara** da ciò che il professionista ha
  cambiato (vedi «Apprendimento») e si archivia.
- **Richiesta diretta** («analizza il prezzo di…», «componi il prezzo
  della voce…»), anche fuori dal computo: stesso procedimento, stessi
  file, nella cartella indicata dal prompt.
- **Computo non estimativo**: l'analisi si fa comunque — serve al
  professionista per sapere cosa sta offrendo e per difendere la
  congruità — ma resta documento di lavoro: non va nella busta tecnica e
  nessun suo numero compare in altri file del computo.

## Procedimento

Lavora un nuovo prezzo alla volta, nell'ordine del computo. Per
ciascuno segui i sette passi; i file di uscita sono in
`references/formato_output.md`.

### 0. Apri la memoria della skill (sempre, prima di tutto)

La skill impara da ogni correzione del professionista. Prima di scrivere
un numero, leggi — se esistono — in `memoria/`. Dentro SPADA la memoria
sta nei dati, `$SPADA_HOME/_data/analisi-nuovi-prezzi/memoria/` (gli
script la usano da soli; `python3 scripts/analisi_np.py memoria stato`
stampa il percorso); fuori da SPADA è la cartella `memoria/` di questa
skill:

| File | Cosa ci trovi | Come usarlo |
|---|---|---|
| `memoria/lezioni.md` | regole ricavate da correzioni passate, con data, gara e motivo | applicale a ogni analisi; se una contraddice il disciplinare o il prezzario della gara corrente, vince la gara e lo annoti. Le righe in «In attesa di rifinitura» non sono ancora regole: se ne trovi, rifiniscile prima di procedere (vedi «Apprendimento», B) — sono due minuti che altrimenti nessuno spende |
| `memoria/prezzi_appresi.json` | costi orari, prezzi di materiali e noli confermati o corretti dal professionista | fonte di terzo livello (vedi gerarchia sotto); se più vecchi di 12 mesi o di un'altra regione, usali solo come ordine di grandezza e marcali «da riverificare» |
| `memoria/analisi_approvate/` | analisi complete già approvate, una per file, con frontmatter ricercabile | cerca una lavorazione analoga (`grep -il` su descrizione e tag): è il modello migliore che hai, più del prezzario, perché l'ha già validata il professionista |

Se `memoria/` è vuota, procedi: la riempirai tu alla fine.

### 1. Inquadra la lavorazione

Dalla voce del computo (elenco delle voci approvato, proposta, scheda
del documento di progetto) ricava: cosa si esegue, **unità di misura**
(la stessa del computo), contesto di posa (altezza, interno/esterno,
su esistente o nuovo), prestazioni richieste (classe, spessore,
certificazione). Scrivi la **descrizione sintetica** (una riga, come il
titolo di una voce di prezzario) e la **descrizione estesa** (cosa
comprende: fornitura, posa, materiali, sfridi, oneri, pulizia; cosa
esclude). La descrizione estesa è quella che va anche nell'«Elenco
delle tariffe» del computo: deve coincidere parola per parola.

### 2. Trova il modello: la voce analoga del prezzario

Cerca con `cerca_voce` (regione e anno esatti del prompt) la voce del
prezzario più vicina alla lavorazione — quella che il computo non ha
potuto usare perché copre solo in parte. Poi `dettaglio_analisi` su quel
codice: ti dà la scomposizione ufficiale (manodopera, materiali,
attrezzature, trasporti) con **quantità per unità e codici delle voci
elementari**. È il punto di partenza: la tua analisi parte da lì e
cambia solo ciò che la lavorazione offerta cambia (materiale diverso,
più ore per una posa più complessa, un mezzo in più). Annota il codice
nel campo `voce_prezzario_analoga`: serve al passo 6.

Se `dettaglio_analisi` restituisce `voce_elementare: true` o nessuna
analisi (prezzari importati da PriMus non la includono), costruisci da
zero seguendo `references/metodo.md` e, se c'è, un'analisi approvata
analoga in memoria.

### 3. Componi le quattro sezioni

Per ogni riga: numero progressivo (1.1, 1.2… 2.1…), descrizione, U.M.,
**quantità per unità di lavorazione**, costo unitario, **fonte**.
L'importo lo calcoli (quantità × costo).

| Sezione | Cosa entra | Attenzioni |
|---|---|---|
| 1. Manodopera | una riga per livello operaio (4°, 3°, 2°, 1° livello) con le ore per unità | **Costo orario: tabella ANCE in vigore alla data della gara**, non il prezzario — è la scelta del professionista. La ricavi con `python3 scripts/aggiorna_manodopera.py applicabile --data-bando <aaaa-mm-gg> --provincia <provincia>` (data: pubblicazione del bando se la conosci dal disciplinare, altrimenti `gara.scadenza_offerta` del manifest; provincia: quella della stazione appaltante). Lo script sceglie l'edizione giusta in `references/manodopera_ance.md`; se la data è oltre l'ultima edizione nota cerca online quella nuova e, se la trova, la aggiunge al file come «DA CONFERMARE» — usala, e scrivi «tabella da confermare» nella nota della riga e in «Da verificare». Se il controllo online fallisce, usa l'ultima edizione nota e aggiungi alla fonte «da aggiornare all'edizione in vigore alla data del bando». Senza Bash: leggi il file a mano con la stessa regola (edizione più recente con decorrenza ≤ data del bando). Versione «oltre 15 dipendenti» salvo che la scheda impresa dica altro. Le ore sono una **stima ipotetica**, come la fa lui: parti dalle ore dell'analisi analoga del prezzario o di un'analisi approvata in memoria, correggile per ciò che la lavorazione offerta cambia, e scrivi il ragionamento in `nota` (squadra × tempo). |
| 2. Materiali | **tutti**, anche i minori: fissaggi, sigillanti, primer, imballi se non compresi | il materiale principale è quasi sempre il motivo del nuovo prezzo: la sua descrizione deve dire la caratteristica che il prezzario non copre. **Lo sfrido non è una riga a sé**: sta dentro la quantità (1,08 m²/m² con «compreso sfrido 8%» nella descrizione). Prezzo: voce elementare del prezzario; altrimenti preventivo o listino del professionista; altrimenti la **tua stima**, dichiarata come tale nella fonte. |
| 3. Mezzi d'opera | attrezzature e mezzi necessari: ore di nolo per unità, costo orario di nolo | parametra le ore del mezzo su quelle della manodopera che lo usa (un trapano lavora quanto l'operaio che lo tiene). Nolo **a freddo** se l'operatore è già in manodopera; **a caldo** solo se l'operatore non c'è, e allora non lo conti due volte. |
| 4. Varie | ciò che non è né forza lavoro né materiale né mezzo: trasporto a discarica, smaltimento, prove e certificazioni, ponteggi se non a corpo altrove, assistenze murarie | spesso vuota; se lo è, scrivilo (`nessuna`) invece di lasciarla implicita. |

**Gerarchia delle fonti** per ogni costo unitario, dalla più alla meno
forte: (1) per la manodopera, la tabella ANCE dell'anno
(`references/manodopera_ance.md`); per tutto il resto la voce
elementare del prezzario della gara, con codice; (2) scomposizione
della voce analoga (`dettaglio_analisi`); (3) prezzo appreso in memoria,
confermato dal professionista, stessa regione, meno di 12 mesi;
(4) preventivo o listino allegato alla gara (`input/`) o indicato dal
professionista nelle risposte della Fase 4; (5) **la tua stima**, con
fonte che inizia con `stima — …` e dice su cosa si basa («listini
produttori HPL compatto 13 mm», «analogia con CAM26_…», «ordine di
grandezza da analisi approvata gara X»).

**Mai `TBD`, mai una casella vuota.** È una scelta del professionista:
un'analisi con un buco non si può leggere né correggere, un'analisi con
una stima dichiarata sì — e tutte le voci si intendono comunque da
verificare da parte sua. La regola che resta ferma è l'altra: una stima
si **chiama** stima. Un numero inventato con una fonte che suona
ufficiale («prezzi di mercato») è l'unico vero errore, perché nessuno lo
riconosce come tale. Le righe stimate finiscono anche nell'elenco «Da
verificare» in coda all'analisi, con cosa servirebbe per confermarle.

### 4. Applica le incidenze obbligatorie e l'utile

Dal totale A (somma delle sezioni 1–4): sicurezza **3%** e spese
generali **15%** su A → totale B = A + 3% A + 15% A; utile d'impresa
**10%** su B → totale generale = B + 10% B = **prezzo di applicazione**,
arrotondato a 2 decimali.

Queste percentuali sono **fisse**: il professionista le usa sempre,
anche quando il prezzario regionale o l'elenco prezzi di progetto ne
dichiarano altre (es. spese generali 13%). Non adattarle, non proporre
di adattarle; `verifica` rifiuta parametri diversi. Il 3% di sicurezza
si somma sempre, anche se il progetto computa a parte gli oneri del PSC:
sono cose diverse (oneri aziendali interni alla lavorazione contro
apprestamenti di cantiere). Se un documento della gara impone
esplicitamente percentuali diverse per le analisi dell'offerta, non
decidere tu: scrivilo in «Da verificare» e lascia che decida il
professionista.

### 5. Calcola le incidenze percentuali

Per **ogni riga** e per ogni sezione, incidenza = importo / prezzo di
applicazione × 100, a 2 decimali. Anche sicurezza, spese generali e
utile hanno la loro incidenza: la somma di tutte deve dare 100,00
(±0,05 per arrotondamento). L'incidenza della manodopera è il dato che
le stazioni appaltanti chiedono più spesso (verifica congruità, costo
della manodopera non ribassabile): mettila in evidenza nel riepilogo.

### 6. Verifica e confronta

- **Aritmetica**: con Bash disponibile, `python3
  scripts/analisi_np.py verifica <cartella>` ricalcola tutto dal JSON e
  confronta col markdown; senza Bash, rifai i conti a mano seguendo la
  checklist in `references/metodo.md` («Controllo aritmetico»).
- **Congruità**: `confronta_prezzo` fra il prezzo di applicazione e la
  voce analoga (`voce_prezzario_analoga`). Uno scostamento ALTO (>15%)
  non è un errore, ma va **spiegato in una riga** nelle note: cosa
  giustifica la differenza (materiale di classe superiore, posa più
  onerosa). Se non sai spiegarlo, probabilmente c'è un errore di
  quantità o di unità di misura: ricontrolla prima di consegnare.
- **Plausibilità delle incidenze**: una lavorazione di posa con
  manodopera al 5% o una fornitura con manodopera al 70% sono campanelli
  d'allarme; le incidenze osservate nelle analisi approvate
  (`memoria/`) ti dicono il range normale per lavorazioni simili.

### 7. Scrivi i file e la copia «generato»

Scrivi `analisi_nuovi_prezzi.json` (fonte di verità, schema in
`references/formato_output.md`) e `analisi_nuovi_prezzi.md` (una sezione
per nuovo prezzo, tabella nel layout del foglio di riferimento, note,
fonti, «da verificare»). Con Bash: scrivi il JSON e lancia `python3
scripts/analisi_np.py rendi <cartella>`, che genera markdown ed Excel
(`analisi_nuovi_prezzi.xlsx`, un foglio per nuovo prezzo, stesso layout
del file di riferimento) garantendo che i tre coincidano. Senza Bash:
scrivi anche il markdown a mano, seguendo il template alla lettera;
l'Excel lo genera il sistema o il professionista con lo stesso comando.

Poi salva una copia di **ciò che hai generato** in
`<cartella>/_generato/analisi_nuovi_prezzi.json`: è il termine di
confronto per capire, allo stadio dopo, cosa il professionista ha
cambiato. Senza questa copia la skill non può imparare.

## Apprendimento: come la skill migliora da sola

La skill non impara dai propri output, impara **dal professionista**:
dalle sue modifiche a mano al file, dalle sue richieste di modifiche
(nota nel prompt), dalle sue approvazioni. Tre momenti.

**A. Quando il prompt porta una RICHIESTA DI MODIFICHE** su un'analisi:
prima di riscrivere, chiediti cosa ti insegna la nota. Se contiene una
regola riutilizzabile («le ore di posa dei pannelli HPL sono sempre
almeno 0,5 h/m²», «per questa stazione appaltante le spese generali
sono il 13%», «il nolo del ponteggio va in varie, non in mezzi»),
aggiungila a `memoria/lezioni.md` nel formato sotto. Se riguarda solo
questa gara («nel nostro cantiere c'è già il ponteggio»), non è una
lezione: applicala e basta.

**B. Allo stadio successivo (definitivo), o quando il file approvato
differisce da `_generato/`**: confronta l'analisi approvata con la copia
generata. Con Bash: `python3 scripts/analisi_np.py apprendi <cartella>`
elenca le differenze (righe aggiunte o tolte, quantità e prezzi cambiati,
percentuali cambiate), accoda le **lezioni candidate** in
`memoria/lezioni.md` sotto «In attesa di rifinitura» e registra i prezzi
corretti. Le candidate sono bozze con segnaposto fra parentesi quadre:
lo script vede *cosa* è cambiato, solo tu (dalla nota del professionista
e dal contesto) sai *perché*. Rifiniscile subito: compila il perché,
generalizza a una famiglia di lavorazioni, fondi i duplicati (la stessa
correzione su due livelli operaio è una lezione, non due), spostale nella
sezione della componente. Senza Bash, leggi i due file e fai il confronto
a mano scrivendo direttamente le lezioni rifinite. Per ogni differenza
decidi:
- **prezzo o costo orario corretto dal professionista** → aggiorna
  `memoria/prezzi_appresi.json` (voce, U.M., prezzo, regione, anno,
  gara, data, `fonte: "correzione professionista"`): è la fonte più
  affidabile che avrai;
- **quantità corretta** (ore, sfridi, consumi) → lezione sulla
  lavorazione, con il valore vecchio e nuovo e il motivo se la nota lo
  dice;
- **riga aggiunta** → lezione del tipo «in [lavorazione] non
  dimenticare [componente]»: le omissioni sono l'errore più frequente
  nelle analisi e il più facile da non ripetere;
- **riga tolta** → lezione solo se il motivo è generale (es. «lo
  smaltimento è già compreso nella voce di demolizione del progetto»).

**C. Alla fine dello stadio definitivo**: ogni analisi approvata va in
`memoria/analisi_approvate/<slug-lavorazione>.md` (frontmatter: codice,
descrizione sintetica, tag, U.M., prezzo, incidenze per sezione, regione,
anno prezzario, gara, data). Da quel momento è un modello per le gare
future. Con Bash lo fa `apprendi --archivia`; senza, copiala a mano con
il frontmatter di `references/formato_output.md`.

### Formato di una lezione

```markdown
- [2026-11-08 · gara <slug> · bozza→correzione] **Manodopera · pareti divisorie HPL**:
  il professionista ha portato la posa da 0,35 a 0,60 h/m² («serve il tracciamento
  della struttura»). Regola: per pareti prefabbricate su struttura stimare ≥0,5 h/m²
  di operaio specializzato. (confermata 1×)
```

Una lezione = una regola generalizzata + il perché + la provenienza.
Quando la stessa regola si ripresenta, non duplicarla: aggiorna il
contatore «confermata n×». Oltre le ~60 lezioni il file va consolidato
(`python3 scripts/analisi_np.py memoria stato` mostra cosa è maturo):
le regole confermate più volte vanno promosse in `references/metodo.md`
e versionate con la pipeline — è l'unico modo in cui l'apprendimento
di una macchina arriva alle altre. Questo lo decide Mike, non la
skill: tu segnala, non promuovere da solo.

### Cosa non si impara mai

- Dai propri output non corretti: un'analisi che nessuno ha toccato non
  è né giusta né sbagliata, è solo non ancora letta.
- Percentuali diverse da 3% / 15% / 10%: non diventano regola nemmeno se
  un documento di gara le usa. Il professionista ha deciso che il suo
  metodo non cambia.
- Prezzi di una gara per un'altra regione o di un'edizione del prezzario
  diversa senza marcarli come tali.
- Nulla che contraddica i vincoli del computo (`deliverable-computo-metrico`):
  nessun prezzo fuori dall'analisi in un computo non estimativo, nessun
  codice inventato.

## Regole che non cambiano

- L'unità di misura dell'analisi è quella della voce di computo. Se
  cambia a metà (materiale in kg, voce in m²), la conversione sta in una
  riga esplicita (es. «consumo 4,2 kg/m²»), mai nella testa.
- Ogni costo unitario ha un valore e una fonte scritta; dove la fonte è
  una stima, la fonte lo dice (`stima — …`). Mai `TBD`, mai vuoto.
- Le percentuali sono 3% / 15% / 10%, sempre. La manodopera si paga
  secondo la tabella ANCE dell'anno, non secondo il prezzario.
- Lo sfrido sta nella quantità del materiale, non in una riga a sé.
- La descrizione estesa del nuovo prezzo coincide con quella
  nell'«Elenco delle tariffe» del computo.
- Nomenclatura: usa i titoli delle proposte e i nomi degli elaborati
  come caricati; i codici interni (P-C1-001) sono tollerati solo nelle
  note di lavoro, mai nelle descrizioni che potrebbero finire in un
  documento per la stazione appaltante.
- Non scrivere file Word o PDF: l'Excel lo produce `analisi_np.py`,
  il resto il sistema.

## File della skill

I percorsi qui sotto sono relativi alla cartella della skill: in una
gara si risolvono da `$SPADA_CLAUDE_DIR/skills/analisi-nuovi-prezzi/`
(es. `python3 "$SPADA_CLAUDE_DIR/skills/analisi-nuovi-prezzi/scripts/analisi_np.py" verifica output/10_offer/C1-0`),
mai dalla directory della gara.

| Percorso | Quando leggerlo |
|---|---|
| `references/metodo.md` | prima analisi della sessione; dubbi su una sezione, le percentuali, il controllo aritmetico |
| `references/fonti.md` | quando non trovi un prezzo: dove cercare, in che ordine, come citare una stima |
| `references/manodopera_ance.md` | per il costo orario della manodopera: tabelle ANCE per provincia ed edizione. È la copia iniziale: dentro SPADA quella aggiornata da `aggiorna_manodopera.py` sta in `$SPADA_HOME/_data/analisi-nuovi-prezzi/manodopera_ance.md` e, se esiste, è quella da leggere; le sezioni «DA CONFERMARE» le conferma il professionista |
| `scripts/aggiorna_manodopera.py` | `applicabile --data-bando … --provincia …` prima di ogni analisi; `online` / `pdf <file>` per aggiornare la tabella a mano |
| `references/formato_output.md` | sempre prima di scrivere: schema JSON, template markdown, frontmatter delle analisi approvate |
| `references/esempio.md` | un'analisi completa svolta, da leggere la prima volta per capire il livello di dettaglio atteso |
| `scripts/analisi_np.py` | `verifica`, `rendi`, `xlsx`, `apprendi`, `memoria stato` — `--help` per l'uso |
| `assets/ANALISI_NUOVI_PREZZI_METODO.xls` | il foglio del professionista: il layout da riprodurre |
| `memoria/` | lezioni, prezzi appresi, analisi approvate (per macchina, non versionata; dentro SPADA in `$SPADA_HOME/_data/analisi-nuovi-prezzi/memoria/`) |
