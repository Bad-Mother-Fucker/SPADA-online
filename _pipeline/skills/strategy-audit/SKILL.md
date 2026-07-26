---
name: strategy-audit
description: Usa quando devi produrre o rigenerare 03_criteria/strategy_audit.md (Fase 1 Step 4, o /run_strategy_audit). Procedura per le quattro analisi: budget sicurezza, gap prezzi, viabilita' cantiere, capacita' di investimento migliorativo.
---

# Skill — Strategy Audit

## Scopo

Procedura operativa per le quattro analisi strategiche eseguite da
`strategy-auditor`. Ogni sezione e' indipendente: l'agente la richiama
per la propria analisi.

**Principio non-prescrittivo**: questa skill produce MISURE e
CLASSIFICAZIONI, non raccomandazioni. La classificazione (BASSO/MEDIO/ALTO,
FAVOREVOLE/SFAVOREVOLE, ecc.) e' un dato — non un giudizio di merito
e non implica nessuna azione specifica.

---

## Analisi 1 — Budget sicurezza

### Fonti da leggere

`02_graph/economic_framework.md` — campi:
- `oneri_sicurezza_eur`
- `importo_lavori_eur`
- `oneri_sicurezza_pct`
- `fonte_sicurezza` (lista di ID nodo)
- `confidence` dei valori

### Procedura

1. Leggi `02_graph/economic_framework.md`.

2. Se `oneri_sicurezza_eur` o `importo_lavori_eur` sono `TBD`:
   - Cerca in `02_graph/index.md` se esiste un nodo con
     `subtype: stima_sicurezza` o `subtype: quadro_economico`
   - Se il nodo esiste ma i dati non sono ancora estratti: scrivi
     sezione con classificazione `NON DISPONIBILE` e motivazione
   - Non invocare document-preprocessor — segnala la lacuna

3. Se entrambi i valori sono disponibili:
   - Calcola `pct = oneri_sicurezza_eur / importo_lavori_eur * 100`
     (verifica che coincida con `oneri_sicurezza_pct` nel frontmatter;
     se discordante: usa il valore calcolato e segnala la discrepanza)

4. Classifica:

   | Percentuale         | Classificazione | Significato                                    |
   |---------------------|-----------------|------------------------------------------------|
   | pct < 2%            | CRITICO         | Oneri molto bassi — probabile PSC inadeguato   |
   | 2% <= pct < 5%      | BASSO           | Sotto la soglia indicativa del 5%              |
   | pct >= 5%           | OK              | Nella norma                                    |

   L'alert scatta quando il budget sicurezza e' INSUFFICIENTE rispetto
   all'importo dei lavori — non quando e' elevato. Oneri troppo bassi
   indicano: PSC potenzialmente non conforme, rischi non coperti, o
   errori di stima da segnalare prima dell'offerta.

5. Se classificazione CRITICO o BASSO: genera un alert esplicito.

6. Se `fonte_sicurezza` elenca piu' fonti (es. stima sicurezza E
   quadro economico): verifica coerenza dei valori tra le fonti.
   Se discordanti: riporta entrambi i valori con le fonti e segnala
   la contraddizione senza scegliere quale sia corretto.

### Testo da produrre per la sezione

```markdown
## 1. Budget sicurezza

**Fonte:** [[codice_descrizione]] — [nome documento] / [sezione] (confidence: [livello])
**Importo oneri sicurezza:** € [valore]
**Importo lavori:** € [valore]
**Percentuale:** [x,xx]%
**Classificazione:** [🔴 CRITICO / ⚠️ BASSO / OK]

[Se CRITICO]:
> 🔴 ALERT: Gli oneri per la sicurezza rappresentano solo il [x]%
> dell'importo lavori, sotto la soglia critica del 2%. Il PSC potrebbe
> essere inadeguato rispetto alla complessita' delle lavorazioni previste.

[Se BASSO]:
> ⚠️ ATTENZIONE: Gli oneri per la sicurezza rappresentano il [x]%
> dell'importo lavori, sotto la soglia indicativa del 5%.

[Se fonti discordanti]:
> ⚠️ CONTRADDIZIONE: il valore da [[codice_descrizione]] e' € [v1]; il valore da
> [[altro_codice_descrizione]] e' € [v2]. Verificare quale documento sia aggiornato.

[Se NON DISPONIBILE]:
> ℹ️ Dati non disponibili: [motivazione]. Estrarre i documenti economici
> prima di rieseguire l'audit.
```

---

## Analisi 2 — Gap prezzi vs prezzario regionale

### Skill da usare

```
prezzario
```

Il confronto si fa per **lookup esatto su codice tariffa**, non per
ricerca testuale: il computo metrico del progetto cita gia' i codici
delle voci di capitolato (es. `CAM26_C06.020.062.I`), e il prezzario
regionale e' indicizzato esattamente su quella chiave. Non serve
cercare corrispondenze testuali tra descrizioni.

### Fonti da leggere

Dal grafo:
- `02_graph/index.md` → cerca nodi con `subtype: elenco_prezzi` o
  `subtype: computo_metrico` con `is_latest: true` — e' la fonte dei
  codici tariffa e delle quantita' del progetto
- Pagina nodo del documento trovato → `extracted_md`
- `01_extracted/text/[codice_descrizione].md` — testo estratto del documento

Prezzario regionale:
- `PROJECT_CONFIG.json` → `gara.prezzario_riferimento.{regione,anno,percorso}`
- Se `percorso` e' vuoto ma `regione` e `anno` sono compilati: esegui
  ```bash
  scripts/prezzario/fetch_prezzario.sh "<regione>" <anno>
  ```
  e scrivi il percorso restituito in `prezzario_riferimento.percorso`.
- Se anche `regione`/`anno` sono vuoti: il professionista non li ha
  ancora indicati (di norma si compilano a `/new_bid`) — classificazione
  `NON DISPONIBILE`, non improvvisare una regione.

### Procedura

1. **Individua il documento prezzi/computo del progetto.**
   Da `02_graph/index.md`, sezione documenti per sezione 08:
   - Cerca `subtype: elenco_prezzi` (08.R01) o `subtype: computo_metrico` (08.R02)
   - Se piu' versioni: usa `is_latest: true`
   - Se nessun documento: classificazione `NON DISPONIBILE`

2. **Individua il prezzario regionale** (vedi skill `prezzario` per la
   procedura di fetch/cache completa). Se non disponibile per questa
   regione/anno: scrivi la sezione con classificazione `NON DISPONIBILE`
   e le istruzioni per renderlo disponibile (vedi template sotto) —
   **non stimare un prezzo a occhio**.

3. **Se entrambi disponibili — calcola il gap:**
   a. Dal documento prezzi/computo del progetto: estrai un campione di
      10-20 voci significative (le piu' rilevanti per importo o
      frequenza), con il loro `codice_completo`. Non cercare tutte le voci.

      **Il campione va costruito per categoria, non "le prime che
      trovi".** Prima di campionare, ricava dal computo l'elenco delle
      categorie di lavorazione presenti (primo livello del codice
      tariffa, es. `C.01`, `C.02`, `C.06`) con il rispettivo importo.
      Poi campiona **almeno una voce per ogni categoria che pesa >= 5%
      dell'importo lavori**. Se il testo estratto non contiene affatto
      una di quelle categorie, quella categoria e' **non coperta**:
      registrala come tale, non ignorarla in silenzio.
   b. Per ogni voce del campione: lookup esatto nel prezzario regionale
      su `codice_completo` (skill `prezzario`, sezione "Lookup esatto
      per codice"). Se il codice non esiste nel prezzario (voce a corpo,
      prezzo custom del progettista): segnala quella voce come
      "non confrontabile", escludila dalla media — non forzare un match
      approssimativo per descrizione.
   c. Per ogni coppia trovata, confronta col campo `prezzo` (comprensivo
      di S.G. e U.I. — vedi skill `prezzario`):
      - `gap% = (prezzo_progetto - prezzo_prezzario) / prezzo_prezzario * 100`
      - Positivo = il progetto usa prezzi piu' alti del prezzario
      - Negativo = il progetto usa prezzi piu' bassi
   d. `gap_medio% = media aritmetica dei gap% del campione` (sulle sole
      voci confrontabili)
   e. Classifica il gap medio:
      - `|gap_medio| < 5%`: BASSO
      - `5% ≤ |gap_medio| < 15%`: MEDIO
      - `|gap_medio| ≥ 15%`: ALTO

4. **Gate di copertura — obbligatorio prima di pubblicare la
   classificazione.**

   Un gap medio calcolato su un campione che tocca una sola categoria di
   lavorazione non e' una misura del progetto: e' una misura di quella
   categoria. La classificazione BASSO/MEDIO/ALTO va emessa **solo** se
   il campione supera entrambe le soglie qui sotto.

   Calcola e riporta sempre, prima della classificazione:

   ```text
   copertura_importo% = somma importi delle voci confrontate
                        / importo_lavori_eur * 100
   categorie_coperte   = n. categorie con >= 1 voce confrontata
   categorie_rilevanti = n. categorie che pesano >= 5% dell'importo lavori
   ```

   `importo_lavori_eur` viene da `02_graph/economic_framework.md`. Se e'
   `TBD`, `copertura_importo%` non e' calcolabile: la classificazione e'
   automaticamente `NON RAPPRESENTATIVO`.

   | Condizione                                                             | Esito                      |
   |------------------------------------------------------------------------|----------------------------|
   | `copertura_importo% >= 20%` **e** `categorie_coperte == categorie_rilevanti` | classifica BASSO/MEDIO/ALTO |
   | tutto il resto                                                          | `NON RAPPRESENTATIVO`      |

   Con esito `NON RAPPRESENTATIVO`:
   - **non** scrivere BASSO / MEDIO / ALTO da nessuna parte, nemmeno
     nella tabella "Riepilogo": il valore della cella e'
     `NON RAPPRESENTATIVO`
   - riporta comunque il gap medio calcolato, ma **etichettato con il
     perimetro effettivo** (es. "+7,42% sulle sole voci di C.06 —
     oneri sicurezza"), mai come gap "del progetto"
   - elenca esplicitamente le categorie rilevanti **non coperte** e la
     ragione (testo non estratto / codice assente dal prezzario / voce
     a corpo)
   - Analisi 4 eredita l'esito: vedi il suo passo 1

   Questo gate esiste perche' l'estrazione dei testi e' incrementale
   per costruzione (`graph-builder` Fase 2 non attende tutti i
   documenti): un audit puo' girare legittimamente su un grafo dove
   meta' del computo non e' ancora leggibile. Il campione ristretto non
   e' un errore — presentarlo come misura completa lo e'.

5. **Nota versioni:** se il documento prezzi/computo ha piu' versioni,
   usa sempre la piu' recente (`is_latest: true`). Segnala se versioni
   precedenti esistono.

### Testo da produrre per la sezione

```markdown
## 2. Analisi prezzi — gap rispetto al prezzario

**Documento prezzi usato:** [[codice_descrizione]] — [nome file] (is_latest: true)
**Prezzario di riferimento:** [Regione] [Anno] — [percorso file]
**Voci campionate:** [N] su [totale stimato]
**Copertura per importo:** [x,x]% dell'importo lavori
**Categorie coperte:** [k] su [m] rilevanti (>= 5% dell'importo)
**Gap medio:** [+/-x,xx]% [su tutte le categorie / SOLO su [elenco categorie]]
**Classificazione:** BASSO / MEDIO / ALTO / NON RAPPRESENTATIVO

| Voce | Categoria | Descrizione | Prezzo progetto | Prezzo prezzario | Gap% |
|---|---|---|---|---|---|
| [codice] | [C.xx] | [desc] | € [v1] | € [v2] | [+/-x]% |

**Copertura per categoria:**

| Categoria | Peso sull'importo | Voci confrontate | Stato |
|---|---|---|---|
| [C.01] | [x]% | [n] | coperta / NON COPERTA — [ragione] |

[Note su voci con gap estremi se presenti]

[Se NON RAPPRESENTATIVO]:
> ⚠️ CAMPIONE NON RAPPRESENTATIVO: il confronto copre il [x]%
> dell'importo lavori e [k] categorie su [m] rilevanti. Il valore
> [+/-x,xx]% misura le sole voci di [categorie coperte] e **non e' il
> gap del progetto**: non usarlo per stimare il margine complessivo.
> Categorie rilevanti non coperte: [elenco con ragione].
> Per completare l'analisi: estrarre i documenti mancanti
> (`/update_document` o rilancio di `graph-builder` Fase 2) e
> rieseguire `/run_strategy_audit`.

[Se NON DISPONIBILE — regione/anno non indicati]:
> ℹ️ Confronto non eseguibile: `prezzario_riferimento.regione`/`.anno`
> non sono compilati in `PROJECT_CONFIG.json`. Indicali (di norma a
> `/new_bid`) e riesegui strategy-auditor.

[Se NON DISPONIBILE — prezzario non ancora pubblicato per questa regione/anno]:
> ℹ️ Confronto non eseguibile: il prezzario [Regione] [Anno] non e'
> disponibile in `prometeus-prezzari`. Per abilitare questa analisi
> vedi il README di quel repo (estrazione da Excel ufficiale +
> pubblicazione di una release), poi riesegui strategy-auditor.

[Se NON DISPONIBILE — documento prezzi mancante]:
> ℹ️ Nessun documento di tipo elenco_prezzi o analisi_prezzi trovato
> nel knowledge graph. Verificare che i documenti economici siano stati
> estratti e indicizzati da graph-builder.
```

---

## Analisi 3 — Posizione e viabilita' cantiere

### Fonti da leggere

Dal grafo:
- `02_graph/index.md` → cerca nodi con `subtype: relazione_generale`
  (sezione 01) e `subtype: PSC` (sezione 09)
- Testi estratti dei documenti trovati in `01_extracted/text/`

### Procedura

1. **Individua i documenti fonte.**
   Da `02_graph/index.md`:
   - `subtype: relazione_generale` → informazioni su localizzazione
   - `subtype: PSC` → viabilita', accessi, rischi cantiere
   Se nessuno dei due e' estratto: classificazione `NON DISPONIBILE`

2. **Estrai le informazioni rilevanti dal testo.**
   Cerca nei testi estratti:
   - Localizzazione: comune, via, zona (industriale/residenziale/
     centro storico/periferica)
   - Viabilita': tipo di strade di accesso, larghezze, restrizioni
     al traffico pesante, ZTL, ore di transito consentite
   - Accessi cantiere: accessi diretti, necessita' di occupazioni
     temporanee di suolo pubblico, distanza da raccordi/autostrade
   - Vincoli specifici: centro storico, aree protette, strade strette,
     ponti con limiti di peso

3. **Classifica in base agli elementi rilevati:**

   FAVOREVOLE — almeno due dei seguenti:
   - Zona industriale o periferica
   - Accesso diretto da strade provinciali o autostrade
   - Nessun vincolo orario citato
   - Ampia viabilita' di accesso

   SFAVOREVOLE — almeno uno dei seguenti:
   - Centro storico o zona con ZTL
   - Strade di accesso citate come strette o con limitazioni
   - Divieti di transito mezzi pesanti citati esplicitamente
   - Orari di cantiere vincolati dalla normativa locale

   NEUTRO — tutto il resto

4. Se le informazioni nel testo sono vaghe o assenti: classifica
   `NON DETERMINABILE` (diverso da NEUTRO — indica dati insufficienti).

### Testo da produrre per la sezione

```markdown
## 3. Posizione e viabilita' cantiere

**Fonti:** [[codice_descrizione]] (relazione generale), [[altro_codice_descrizione]] (PSC)
**Localizzazione estratta:** [indirizzo/zona come appare nei documenti]
**Classificazione:** FAVOREVOLE / NEUTRO / SFAVOREVOLE / NON DETERMINABILE

**Elementi rilevati:**
- [elemento 1 — cita la fonte esatta nel documento]
- [elemento 2]
- [elemento 3]

[Se NON DETERMINABILE]:
> ℹ️ Le informazioni sulla viabilita' nel testo estratto sono
> insufficienti per una classificazione. Verificare manualmente
> relazione generale e PSC.
```

---

## Analisi 4 — Capacita' di investimento migliorativo

### Scopo

Misura quante risorse aggiuntive (figure tecniche, non tecniche,
materiali, prodotti, servizi accessori) l'impresa potrebbe destinare
al miglioramento dell'offerta tecnica senza compromettere la
sostenibilita' economica, basandosi sul gap tra i prezzi a computo e
il prezzario regionale.

Questa analisi non e' un giudizio sulla convenienza dell'investimento
— decide il professionista. E' una misura del margine disponibile.

### Fonti da leggere

- Risultato di Analisi 2 (gap medio% e importo lavori)
- `02_graph/economic_framework.md` — campo `importo_lavori_eur`
- Tabella voci campionate in Analisi 2 — identifica le categorie con
  gap piu' elevato e quelle con gap piu' basso o negativo

### Procedura

1. **Recupera i dati da Analisi 2.**
   - `gap_medio%` — gia' calcolato
   - `importo_lavori_eur` — da `economic_framework.md`
   - Se Analisi 2 e' NON DISPONIBILE: classifica come NON CALCOLABILE
     e segnala che il confronto richiede il prezzario regionale.
   - Se Analisi 2 e' **NON RAPPRESENTATIVO**: classifica come
     **NON CALCOLABILE** e fermati al passo 5. Il margine teorico si
     ottiene moltiplicando `gap_medio%` per l'intero importo lavori:
     estrapolare all'intero importo un gap misurato su una frazione
     delle categorie produce un numero in euro che sembra una misura e
     non lo e'. **Non calcolare `margine_eur` in questo caso**, nemmeno
     con una riserva a testo: il numero, una volta scritto, viene
     riusato a valle.
     Riporta invece: copertura raggiunta, categorie non coperte, e cosa
     serve per completare il calcolo.

2. **Calcola il margine teorico complessivo.**
   `margine_eur = gap_medio% / 100 * importo_lavori_eur`
   Questo e' il delta aggregato tra i prezzi a computo e il prezzario.
   Un valore positivo indica che il computo usa prezzi superiori al
   prezzario — esiste uno spazio teorico prima di scendere al livello
   del prezzario regionale.
   Un valore negativo indica che il computo e' gia' sotto il prezzario
   — ogni investimento aggiuntivo riduce il margine dell'impresa.
   Riporta entrambi il valore assoluto (EUR) e il valore percentuale.

3. **Identifica le categorie con piu' e meno margine.**
   Dalla tabella voci di Analisi 2, elenca:
   - Le 3 voci con gap% piu' alto (maggiore spazio di investimento)
   - Le 3 voci con gap% piu' basso o negativo (minore spazio)
   Queste voci indicano dove e' piu' o meno sostenibile concentrare
   investimenti migliorativi.

4. **Classifica la capacita' di investimento:**

   | Margine teorico | Classificazione | Significato                          |
   |-----------------|-----------------|--------------------------------------|
   | gap > 10%       | AMPIO           | Spazio significativo per investimenti |
   | 5% <= gap <= 10%| MODERATO        | Spazio selettivo — voci ad alto gap  |
   | 0% < gap < 5%   | LIMITATO        | Poco spazio — investimenti puntuali  |
   | gap <= 0%       | ASSENTE         | Ogni investimento erode il margine   |
   | N.D.            | NON CALCOLABILE | Prezzario mancante, oppure Analisi 2 NON RAPPRESENTATIVO |

5. Non indicare quale investimento fare o quante risorse stanziare:
   questa e' una decisione del professionista, raccolta nella sezione
   "Indicazioni strategiche".

### Testo da produrre per la sezione

```markdown
## 4. Capacita' di investimento migliorativo

**Gap medio vs prezzario:** [+/-x,xx]% (da Analisi 2)
**Importo lavori:** € [valore] (da economic_framework.md)
**Margine teorico complessivo:** € [valore] ([+/-x,xx]%)
**Classificazione:** AMPIO / MODERATO / LIMITATO / ASSENTE / NON CALCOLABILE

**Categorie con maggiore spazio di investimento:**
| Voce | Gap% |
|---|---|
| [voce 1] | [+x]% |
| [voce 2] | [+x]% |
| [voce 3] | [+x]% |

**Categorie con minore spazio (o gap negativo):**
| Voce | Gap% |
|---|---|
| [voce 1] | [-x]% |
| [voce 2] | [-x]% |
| [voce 3] | [-x]% |

[Se ASSENTE]:
> ⚠️ ATTENZIONE: I prezzi a computo sono gia' inferiori al prezzario
> regionale di [x]%. Ogni investimento aggiuntivo non finanziato dal
> delta di prezzo si traduce in una riduzione diretta del margine.

[Se NON CALCOLABILE — prezzario mancante]:
> ℹ️ Calcolo non eseguibile: Analisi 2 non disponibile (prezzario
> mancante). Aggiungere il prezzario e rieseguire l'audit per
> ottenere questa stima.

[Se NON CALCOLABILE — campione non rappresentativo]:
> ⚠️ Margine non calcolato: Analisi 2 e' NON RAPPRESENTATIVO
> (copertura [x]% dell'importo, [k]/[m] categorie rilevanti). Il gap
> misurato riguarda [categorie coperte] e non e' estrapolabile
> all'intero importo lavori. Nessuna cifra di margine viene prodotta
> finche' la copertura non sale sopra il 20% dell'importo con tutte le
> categorie rilevanti rappresentate.
> Categorie mancanti: [elenco]. Azione: estrarre i documenti relativi e
> rieseguire `/run_strategy_audit`.
```

---

## Generazione domande chiave

### Principio

Le domande derivano dai dati delle quattro analisi — non da
valutazioni di merito. Ogni domanda ha un solo scopo: invitare il
professionista a ragionare su un dato specifico prima di costruire
la strategia.

Non fare domande retoriche. Non fare domande che implicano la risposta.

### Struttura per tipo di dato

**Da Analisi 1 (budget sicurezza):**
- Se CRITICO: "Il budget sicurezza del [x]%, sotto la soglia critica
  del 2%, e' coerente con la complessita' delle lavorazioni previste o
  segnala un PSC da rivedere?"
- Se BASSO: "Il budget sicurezza del [x]%, sotto la soglia indicativa
  del 5%, copre adeguatamente i rischi di cantiere identificati?"

**Da Analisi 2 (gap prezzi):**
- Se BASSO: "Con un gap medio del [x]% rispetto al prezzario,
  quali voci offrono comunque margine per proposte migliorative?"
- Se MEDIO: "Quali categorie di lavoro mostrano il gap piu' elevato
  rispetto al prezzario e potrebbero quindi sostenere proposte
  tecnicamente audaci?"
- Se ALTO: "Il gap medio del [x]% riflette scelte progettuali
  specifiche o e' distribuito uniformemente su tutte le categorie?"
- Se NON DISPONIBILE: "E' possibile procurarsi il prezzario
  regionale [Regione] [Anno] per eseguire il confronto prezzi prima
  della scadenza dell'offerta?"
- Se NON RAPPRESENTATIVO: "Il confronto copre finora solo
  [categorie coperte] ([x]% dell'importo): e' possibile completare
  l'estrazione di [categorie mancanti] prima della scadenza, o si
  procede accettando che il margine sui lavori a misura resti non
  misurato?" — questa domanda e' **obbligatoria** quando il gate di
  copertura non e' superato.

**Da Analisi 3 (cantiere):**
- Se SFAVOREVOLE: "I vincoli di viabilita' identificati sono
  stati considerati nel cronoprogramma e nel PSC?"
- Se NON DETERMINABILE: "E' possibile verificare le condizioni di
  accesso al cantiere direttamente o tramite sopralluogo?"

**Da Analisi 4 (investimento migliorativo):**
- Se AMPIO: "Il margine teorico di circa € [Y] ([x]% sull'importo
  lavori) consente investimenti significativi: quali figure tecniche
  o materiali aggiuntivi avrebbero il maggiore impatto sul punteggio
  tecnico?"
- Se MODERATO: "Con un margine di € [Y], quali 2-3 voci ad alto gap
  potrebbero sostenere un investimento migliorativo selettivo senza
  comprimere il margine complessivo?"
- Se LIMITATO: "Con uno spazio di soli € [Y] ([x]%), l'investimento
  migliorativo deve essere molto puntuale: quale singola voce tecnica
  ha il rapporto punteggio/costo piu' favorevole?"
- Se ASSENTE: "I prezzi a computo sono gia' sotto il prezzario di
  [x]%: l'impresa e' disponibile a investire in miglioramenti tecnici
  attingendo direttamente al proprio margine, e se si' fino a quale
  soglia?"
- Se NON CALCOLABILE: "E' possibile procurarsi il prezzario regionale
  per stimare il margine disponibile prima della scadenza?"

**Domanda trasversale (sempre presente):**
- "Quale delle quattro analisi ha la priorita' maggiore per la
  costruzione dell'offerta tecnica?"

### Numero e selezione

Genera tra 4 e 6 domande. Seleziona le piu' rilevanti in base ai
dati emersi. Non generare mai domande per analisi con classificazione
OK o dati non disponibili senza motivo specifico.

---

## Template output completo — strategy_audit.md

```markdown
# Audit Strategico — [PROJECT_CONFIG.gara.nome]

**Generato il:** [data]
**Agente:** strategy-auditor
**Knowledge graph:** 02_graph/index.md (build del [data dal log])

---

[SEZIONE ANALISI 1 — come definita sopra]

---

[SEZIONE ANALISI 2 — come definita sopra]

---

[SEZIONE ANALISI 3 — come definita sopra]

---

[SEZIONE ANALISI 4 — come definita sopra]

---

## Domande chiave per il professionista

1. [domanda 1]
2. [domanda 2]
3. [domanda 3]
[4. domanda 4 — se rilevante]
[5. domanda 5 — se rilevante]

---

## Riepilogo

| Analisi | Classificazione | Alert |
|---|---|---|
| Budget sicurezza | [CRITICO / BASSO / OK / N.D.] | [testo alert o —] |
| Gap prezzi | [BASSO / MEDIO / ALTO / NON RAPPRESENTATIVO / N.D.] | [copertura [x]% su [k]/[m] categorie, se non rappresentativo] |
| Viabilita' cantiere | [FAV / NEUTRO / SFAV / N.D.] | [testo alert o —] |
| Investimento migliorativo | [AMPIO / MODERATO / LIMITATO / ASSENTE / N.C.] | [margine EUR o —] |

---

## Indicazioni strategiche del professionista

> Compilare questa sezione dopo la lettura dell'audit.
> Le indicazioni guidano l'analisi dei criteri nelle fasi successive.

### Risposte alle domande chiave

1. [risposta]
2. [risposta]
3. [risposta]

### Direttive operative

**Tono generale:** [conservativo / bilanciato / audace]

**Priorita' per criterio:**
- C1: [indicazione]
- C2: [indicazione]

**Vincoli specifici:**
- [vincolo]

**Opportunita' da valorizzare:**
- [opportunita']

**Note aggiuntive:**
[testo libero]
```
