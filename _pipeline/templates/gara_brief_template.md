# Gara Brief — [manifest.json → nome esteso della gara, come nell'oggetto del disciplinare]

**CIG:** [CIG] · **CUP:** [CUP o TBD] · **Importo a base d'asta:** € [importo soggetto a ribasso] + € [oneri sicurezza non ribassabili] = € [totale] (IVA esclusa) · **Scadenza:** [giorno della settimana gg/mm/aaaa ore hh:mm]
**Stazione appaltante:** [SA — ufficio] · RUP [nome] · [tipo di procedura e piattaforma] · [criterio di aggiudicazione]
**Ultimo aggiornamento:** [gg/mm/aaaa] · [Fase N — cosa] · **Fonti finora:** [disciplinare e bando · elaborati (Fase 2) · audit strategico (Fase 3) · risposte del professionista (Fase 4) · documenti integrati dopo]

<!--
UN SOLO DOCUMENTO VIVO, SEZIONI FISSE.

Il brief nasce in Fase 1 con le informazioni minime (solo disciplinare) e
si arricchisce fase dopo fase. Le sezioni sono SEMPRE queste, in
quest'ordine, con questi titoli: l'interfaccia le riconosce dal titolo.
Non se ne aggiungono, non se ne tolgono, non si rinominano. Una sezione
non ancora popolabile resta presente con la sola riga «Da completare».

Ogni sezione si apre con UNA riga di stato, che si sostituisce a ogni
aggiornamento (mai accodata):
  > **Aggiornata:** Fase N · gg/mm/aaaa · [fonti usate, in breve]
oppure, finché nessuna fase ha i dati per scriverla:
  > **Da completare:** in Fase N, [con cosa].

Chi scrive cosa:

| Sezione | Fase 1 (disciplinare) | Fase 2 (elaborati) | Fase 3 (audit) | Fase 4 (risposte) | Integrazioni |
|---|---|---|---|---|---|
| Scadenze operative | crea | ricalcola «oggi» | ricalcola «oggi» | segna gli adempimenti confermati | ricalcola |
| In sintesi | crea | contesto dell'opera dagli elaborati | una frase sul quadro strategico | — | se cambia |
| Struttura del punteggio | crea | — | — | — | solo per un chiarimento SA |
| Vincoli di formato | crea | — | — | — | solo per un chiarimento SA |
| Criteri in dettaglio | crea (sommario, sub, deliverables) | «Base di progetto» | — | «Indicazione del professionista» | «Base di progetto» |
| Documentazione di gara | elenco citato + presenza | letti, mancanti, fuori elenco, versioni | — | — | documento aggiunto |
| Quadro tecnico-economico | da completare | importi e discordanze | classificazioni delle 4 analisi | dati dichiarati | se cambia |
| Dove si concentra il potenziale | crea | raffina con gli elaborati | raffina con il margine | raffina con le priorità | se cambia |
| Vincoli principali | crea | vincoli dagli elaborati | — | vincoli del professionista | se cambia |
| Informazioni dal professionista | da completare | — | — | crea / aggiorna | — |
| Prossimi passi | crea | riscrive | riscrive | riscrive | riscrive |
| Storico aggiornamenti | prima riga | una riga | una riga | una riga | una riga |

Le righe «**Stato analisi:**» dei criteri le scrivono SOLO evidence-auditor
e feedback-processor (Fasi 5-6): chi aggiorna il brief le ricopia tal quali.

NIENTE DOMANDE NEL BRIEF. Le domande al professionista (amministrative,
quesiti alla stazione appaltante, tecniche, strategiche) vanno nel
registro unico della Fase 4, con
`python3 <SPADA_CLAUDE_DIR>/scripts/domande/domande.py aggiungi ...`.
Il brief ne riporta solo il conteggio nei «Prossimi passi».
-->

---

## Scadenze operative

> **Aggiornata:** Fase [N] · [gg/mm/aaaa] · [articolo/sezione del disciplinare e del bando]

> **ALERT — SCADENZE OPERATIVE.** Date verificate su [articolo/sezione del disciplinare e del bando]. Oggi è [giorno gg/mm/aaaa].
>
> **[GIORNO gg/mm/aaaa ORE hh:mm] — [ADEMPIMENTO IN MAIUSCOLO]**: [cosa fare e conseguenza se si manca, con articolo e pagina]. [Quanto tempo resta, se la scadenza è vicina.]
>
> [Una riga per ogni scadenza bloccante: sopralluogo, chiarimenti, caricamento offerta.]

| Scadenza | Data e ora | Cosa fare | Se si manca | Stato | Fonte |
|---|---|---|---|---|---|
| [es. Richiesta sopralluogo] | [gg/mm/aaaa ore hh:mm] | [azione concreta e modalità] | [es. Offerta inammissibile] | [da fare / confermato dal professionista (D-nnn) / scaduta] | [art. X (p. N)] |
| [es. Quesiti di chiarimento] | | | | | |
| [es. Caricamento offerta] | | | | | |
| [es. Validità offerta] | | | | | |

---

## In sintesi

> **Aggiornata:** Fase [N] · [gg/mm/aaaa] · [fonti]

[3-5 frasi in prosa: oggetto dell'appalto (lavori/forniture/misto, lotti),
localizzazione e contesto dell'opera, importo complessivo con le sue
componenti, categorie (prevalente e scorporabili), durata, stato del
progetto e finanziamento, vincoli di contesto che pesano sull'esecuzione.
Ogni dato con l'articolo e la pagina da cui viene.
Dalla Fase 2: cosa dicono gli elaborati dell'opera (stato di fatto,
interventi previsti, vincoli di tutela o di cantiere), con il codice
dell'elaborato. Dalla Fase 3: una frase sul quadro strategico.]

---

## Struttura del punteggio

> **Aggiornata:** Fase 1 · [gg/mm/aaaa] · disciplinare [art. X]

| Criterio | Titolo | Punti | Peso% | Priorita' |
|---|---|---|---|---|
| [[C1]] | [titolo] | [N] | [x]% | [ALTA se > 20%] |
| [[C2]] | [titolo] | [N] | [x]% | |
| **TOTALE OFFERTA TECNICA** | | **[N]** | **100%** | |

> I criteri con peso > 20% sono ad **ALTA priorita'**: concentrare qui
> le risorse di analisi.

| Componente | Punti | Note | Fonte |
|---|---|---|---|
| Offerta tecnica | [N] | [quanti discrezionali, quanti tabellari] | [art. X (p. N)] |
| Offerta economica | [N] | [base del ribasso, formula] | [art. X (p. N)] |
| Offerta temporale | [N o 0] | [se prevista e come] | [art. X (p. N)] |
| **Totale** | **[N]** | | [art. X] |

> ATTENZIONE — **Soglia di sbarramento: [N] punti su [N]** [prima/dopo la riparametrazione]. [Conseguenza.] ([art. X (p. N)])
> *(Ometti questo blocco se il disciplinare non prevede una soglia.)*

**Come si assegnano i punti (D):** [metodo per i criteri discrezionali: chi valuta, scala dei coefficienti, media, moltiplicazione — con articolo].
**Riparametrazione:** [se e come avviene, e cosa implica: per criterio o per sub-criterio].
**Tabellari (T):** [come si assegnano i punti on/off o quantitativi].

---

## Vincoli di formato dell'offerta tecnica

> **Aggiornata:** Fase 1 · [gg/mm/aaaa] · disciplinare [art. X]

> ATTENZIONE — **[Il vincolo di formato più importante in una frase: es. limite di pagine/facciate, formato, carattere, struttura]**. [Divieti a pena di esclusione, es. nessun elemento economico nella busta tecnica] ([art. X (p. N)]).

| Parametro | Prescrizione del disciplinare | Fonte |
|---|---|---|
| Documento principale | [cosa va prodotto] | [art. X (p. N)] |
| Lunghezza | [limite e tipo: per criterio o totale distribuibile] | |
| Formato pagina | [es. A4, pagine numerate] | |
| Carattere | [dimensione e tipo, o [non indicato]] | |
| Interlinea, margini, righe per facciata | [valori o [non indicato]] | |
| Struttura | [organizzazione imposta] | |
| Esclusi dal conteggio | [copertine, indici, allegati...] | |
| Allegati ammessi | [cosa, quanti, formato] | |
| Allegato obbligatorio [n] | [documento richiesto e suo contenuto obbligatorio] | |
| Elementi economici | [divieti e conseguenze] | |
| Firma e caricamento | [firma richiesta, busta/slot, forma di partecipazione] | |
| Lingua | [lingua] | |
| Errori e carenze | [soccorso istruttorio sì/no, chiarimenti] | |

> ATTENZIONE — [Ogni altra dichiarazione o adempimento che riguarda l'offerta tecnica e che il professionista non deve dimenticare: es. dichiarazione sull'uso di sistemi di intelligenza artificiale.] *(Ometti se non ce ne sono.)*

---

## Criteri in dettaglio

> **Aggiornata:** Fase [N] · [gg/mm/aaaa] · [fonti]

### [[C1]] — [titolo] ([N] punti)

**Sommario.** [3-5 frasi dal disciplinare: cosa valuta il criterio,
quali famiglie di migliorie premia e con quali parametri misurabili,
come viene attribuito il punteggio (formula o giudizio discrezionale),
il riferimento di confronto dichiarato (es. minimi di progetto), con
articolo e pagina.]

| Sub | Titolo | Punti | Natura |
|---|---|---|---|
| C1.1 | [titolo del sub-criterio] | [N] | [Discrezionale / Tabellare / Quantitativo] |
| C1.2 | [titolo] | [N] | |

**Deliverables richiesti:**

| Deliverable | Vincolo di formato | Fonte |
|---|---|---|
| [es. Relazione tecnica, sezione C1 con C1.1 e C1.2] | [es. rientra nelle N facciate complessive, carattere ≥ 11 pt] | [art. X, p. N] |
| [es. Computo metrico non estimativo, voci C1] | [contenuto obbligatorio e divieti] | [art. X, p. N] |

**Base di progetto:** [Da completare in Fase 2. Poi: gli elaborati che
sostengono il criterio (codici, dal `supported_by` della pagina
criterio), il valore di progetto da superare con le migliorie ("minimi
di progetto") con il documento che lo fissa, le discordanze tra
documenti che toccano il criterio (D-n di `economic_framework.md`).]

**Indicazione del professionista:** [Da completare in Fase 4. Poi:
priorità e indicazione per questo criterio, e le risposte che lo
riguardano (D-nnn).]

**Stato analisi:** non ancora analizzato

---

### [[C2]] — [titolo] ([N] punti)

[stessa struttura: Sommario, tabella dei sub-criteri, Deliverables richiesti, Base di progetto, Indicazione del professionista, Stato analisi]

---

## Documentazione di gara

> **Aggiornata:** Fase [N] · [gg/mm/aaaa] · [fonti]

[Fase 1: gli elaborati citati nel disciplinare e la loro presenza tra i
file caricati (da `input/_manifest_input.md`, se esiste: gli elaborati
non sono ancora stati letti). Dalla Fase 2: cosa è stato letto ed
estratto, cosa manca, cosa è arrivato fuori elenco, le versioni
superate. Le integrazioni aggiungono una riga per documento.]

| Elaborato | Citato nel disciplinare | Serve a | Presenza | Stato nel grafo |
|---|---|---|---|---|
| [codice e titolo] | [art. X (p. N) o «no»] | [criteri o sub] | [Presente / Mancante / Fuori elenco / Versione superata] | [Da leggere (Fase 1) / Letto / Tavola non estratta / Integrato il gg/mm] |

> ATTENZIONE — [Elaborati citati dal disciplinare ma assenti, con il criterio che ne dipende.] *(Ometti se non ce ne sono.)*

---

## Quadro tecnico-economico

> **Da completare:** in Fase 2, con il quadro economico e il computo letti dagli elaborati.

[Dalla Fase 2: importi del quadro economico e del computo, oneri e
manodopera, categorie, e le discordanze tra documenti più rilevanti per
l'offerta (D-n di `02_graph/economic_framework.md`, con i documenti in
contrasto). Dalla Fase 3: le classificazioni delle quattro analisi
dell'audit strategico (budget sicurezza, gap prezzi, viabilità del
cantiere, investimento migliorativo) con il dato che le motiva. Dalla
Fase 4: i dati dichiarati dal professionista (es. budget per le
migliorie), con il riferimento D-nnn.]

| Voce | Valore | Fonte | Note |
|---|---|---|---|
| [es. Importo lavori a base d'asta] | [€] | [documento o articolo] | [confidenza / discordanza] |

---

## Dove si concentra il potenziale

> **Aggiornata:** Fase [N] · [gg/mm/aaaa] · [fonti]

[Una frase sul meccanismo di punteggio che orienta la scelta (es. con la
riparametrazione per sub-criterio la proposta migliore prende tutti i
punti). Poi un punto per ogni area, dalla più promettente: criteri con
modification_limits vuoti o permissivi, elementi premianti ampi e
misurabili, tabellari "a costo zero" da verificare subito. Dalla Fase 2
con il valore di progetto da superare, dalla Fase 3 con il margine
disponibile, dalla Fase 4 con le priorità del professionista.]

- **[C2.1 — titolo] ([N] pt)**: [perché il margine è alto e cosa lo limita]
- **[C1.1 — titolo] ([N] pt)**: [leve disponibili e come rendere verificabile il miglioramento]

---

## Vincoli principali

> **Aggiornata:** Fase [N] · [gg/mm/aaaa] · [fonti]

[Limitazioni che restringono le proposte — dal disciplinare
(modification_limits e fuori_scope_risks dei criteri), dagli elaborati
(tutela, cantiere, prescrizioni di progetto, dalla Fase 2) e dal
professionista (Fase 4), sempre con il riferimento.]

- [C1-C4]: [vincolo comune, es. caratteristiche minime a pena di esclusione (art. X)]
- [C1]: [vincolo specifico]
- [C5], [C6]: punteggio predeterminato — nessuna proposta migliorativa possibile

---

## Informazioni dal professionista

> **Da completare:** in Fase 4, quando il professionista invia risposte e indicazioni.

[Dalla Fase 4, da `output/07_questions/risposte_professionista.md`: il
tono scelto, le priorità per criterio, i vincoli e le opportunità
indicati, e le risposte che cambiano il quadro (requisiti posseduti,
budget, adempimenti confermati, scelte tecniche), ciascuna con il suo
D-nnn. Le domande rimaste senza risposta: solo il numero, con il
rimando alla Fase 4.]

---

## Prossimi passi

> **Aggiornata:** Fase [N] · [gg/mm/aaaa]

1. **[Entro la prima scadenza bloccante]**: [azione concreta]
2. [Domande al professionista: N aperte nel registro della Fase 4, di cui M urgenti per scadenza (es. sopralluogo, quesiti alla SA).]
3. [Caricare o completare gli elaborati in `input/elaborati/`, se mancano.]
4. [Prossima fase della pipeline e cosa produrrà.]
5. [Eventuali limiti noti, es. prezzario regionale non disponibile: le valutazioni economiche saranno rinviate.]

---

## Storico aggiornamenti

| Data | Evento | Sezioni aggiornate |
|---|---|---|
| [gg/mm/aaaa] | Fase 1 — prima stesura dal disciplinare | tutte |
