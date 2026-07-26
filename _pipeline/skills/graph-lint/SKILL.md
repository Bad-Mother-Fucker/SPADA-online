---
name: graph-lint
description: Usa quando devi verificare la salute del knowledge graph — dopo ogni build, su /graph_health, o prima di analizzare un criterio. Individua orfani, contraddizioni nei dati economici, archi mancanti e wikilink rotti.
---

# Skill — Graph Lint

## Scopo

Verificare la salute del knowledge graph dopo ogni build e su richiesta.
Individua tre categorie di problemi: orfani, contraddizioni, archi
mancanti sospetti. Produce un report e aggiorna `log.md`.

Il lint non modifica il grafo: segnala, non corregge. La correzione
e' responsabilita' del professionista o di un re-ingest.

---

## Quando usarla

- Automaticamente a fine `build-knowledge-graph` (Fase H, dopo index)
- Su comando `/graph_health`
- Ogni volta che si sospetta un problema nell'indice

---

## Procedura

### Step 0 — Check meccanici (obbligatorio, prima di tutto)

I check deterministici li fa uno script, non il grep e non il giudizio:

```bash
node scripts/graph/graph_lint.js
```

Copre: orfani (**inclusa la lista vuota `supports_criteria: []`**, che
il grep non vede), archi senza `reason`, frontmatter incompleto,
`subtype`/`confidence` fuori dal set ammesso, wikilink non risolvibili,
disallineamento `index.md` ↔ file in `02_graph/nodes/`.

Exit code: `0` nessun ERROR, `1` almeno un ERROR, `2` grafo assente.
Con `--json` restituisce i findings strutturati.

**Non rifare a mano i check dello script.** Il tuo lavoro comincia dai
suoi findings:

| Livello | Cosa farne |
|---|---|
| `ERROR` | difetto meccanico certo. Riportalo nel report così com'è. |
| `WARN` | richiede giudizio: è qui che serve la tua valutazione. |

Il giudizio di merito che lo script **non** può dare, e che resta tuo:

- un orfano è *legittimo* (piano esproprio in una gara senza espropri)
  o è un documento rilevante che sta per sfuggire all'analisi?
- un documento con soli archi `confidence: inferito` (finding
  `archi-solo-ereditati`) è davvero collegato al criterio, o ha ereditato
  il collegamento solo per sezione? Questi documenti passano il check
  orfani senza essere realmente supportati: valutali uno per uno.
- due importi discordanti (Check 2 sotto): quale documento è aggiornato?

- un documento con `status: non_estratto` (finding `copertura-estrazione`,
  Check 6): l'estrazione è in coda o è bloccata alla fonte?

I Check 1-6 che seguono restano la specifica del *significato* di ogni
problema e del formato del report. Per i controlli che lo script già
esegue, leggi il suo output invece di rieseguire i grep.

### Check 1 — Orfani (critico: documento rilevante escluso dall'analisi del criterio)

Un documento e' orfano se non ha alcun arco `supports_criteria`.

```bash
# Elenca tutte le pagine nodo
ls 02_graph/nodes/
# Per ogni pagina, verifica che supports_criteria non sia vuoto
grep -l "supports_criteria:" 02_graph/nodes/*.md | wc -l
grep -rL "supports_criteria:" 02_graph/nodes/ 
```

Per ogni orfano trovato:
- Verifica che non sia un documento legittimamente non collegabile
  (es. piano esproprio per una gara senza espropri)
- Se l'assenza e' ingiustificata: segnala come `ALERT` nel report

Un orfano ingiustificato significa quasi sempre che un documento rilevante
resta escluso dall'analisi del criterio che dovrebbe supportare.

### Check 2 — Contraddizioni nei dati economici

Confronta i valori di importo sicurezza tra:
- `02_graph/economic_framework.md` (campo `oneri_sicurezza_eur`)
- La pagina nodo della stima sicurezza (09.R05 o equivalente)

Se i valori sono entrambi `verificato` e discordanti: segnala come
`CONTRADDIZIONE` con entrambi i valori e le fonti.

Confronta anche l'importo lavori totale nel quadro economico vs la
somma delle categorie se entrambi disponibili.

### Check 3 — Archi doc->doc mancanti sospetti

Per ogni sezione che ha sia relazioni che tavole, verifica che esistano
archi `tavola_di` o `relazione_di` tra di esse. Se una sezione ha
tavole senza archi verso nessuna relazione: segnala come `ATTENZIONE`.

Per ogni documento con `subtype: computo_metrico`, verifica che abbia
almeno un arco verso una relazione della stessa sezione o del progetto
generale. Se assente: segnala.

### Check 4 — Versioni multiple senza is_latest

Se esistono piu' pagine con lo stesso `version_group`, verifica che
esattamente una abbia `is_latest: true`. Se zero o piu' di una: segnala
come `ERRORE`.

### Check 5 — scope.md ed economic_framework.md

Verifica che entrambe le pagine esistano. Se mancano: `ERRORE CRITICO`.
Verifica che non abbiano tutti i campi a `TBD`: se si', segnala che
l'estrazione dei documenti economici e' necessaria.

### Check 6 — Copertura estrazione (documento indicizzato ma illeggibile)

Distinto dal Check 1, e va tenuto distinto: l'orfano e' un documento
**presente e non collegato**; qui il documento e' collegato e
indicizzato, ma il suo contenuto non e' mai stato estratto
(`status: non_estratto`). Passa il check orfani, compare nell'index, e
resta comunque invisibile a ogni analisi che legge il testo.

Lo script lo segnala come `copertura-estrazione`:
- `ERROR` sui subtype economici (`computo_metrico`, `elenco_prezzi`,
  `quadro_economico`, `stima_sicurezza`, `quadro_manodopera`): sono le
  fonti di Analisi 1, 2 e 4 di `strategy-auditor`. Con uno di questi
  non estratto, l'audit gira su una base parziale.
- `WARN` sugli altri subtype testuali (le tavole sono escluse: sono
  immagini, `non_estratto` e' il loro stato normale).

Il giudizio che resta tuo: l'estrazione mancante e' **temporanea**
(il documento e' in coda, si completa prima dell'audit) o **bloccata**
(PDF immagine non estraibile, file corrotto)? Nel secondo caso vale
come vincolo permanente della gara e va scritto nel report — non
ripresentato a ogni lint come se fosse in lavorazione.

Se il Check 6 produce ERROR, segnalalo esplicitamente prima di
qualunque esecuzione di `strategy-auditor`: l'audit non e' sbagliato,
ma la sua Analisi 2 uscira' `NON RAPPRESENTATIVO`.

---

## Output

Aggiorna `02_graph/index.md` — sezione "Orfani" (inserisce i nuovi orfani
trovati o conferma lista vuota).

Appendi a `02_graph/log.md`:

```
## [YYYY-MM-DD] lint | N orfani, M contraddizioni, K archi mancanti, Z errori versione
```

Stampa il report nel contesto:

```
Graph Lint — [nome gara] — [data]

ERRORI CRITICI (bloccanti)
  - scope.md assente
  - economic_framework.md assente

ERRORI
  - version_group "computo": is_latest mancante su 08.Q.R02 e 08.Q.R02b

ALERT — Orfani (documenti senza criteri)
  - 08.Q.R03_Quadro_Manodopera — verificare rilevanza

CONTRADDIZIONI
  - oneri_sicurezza: 45.000 EUR in economic_framework vs 38.500 EUR
    in 09.S.R05_Stima_Sicurezza (stima sicurezza) — verificare

ATTENZIONE — Archi mancanti sospetti
  - Sezione 03: 4 tavole senza archi verso relazioni

COPERTURA ESTRAZIONE — documenti indicizzati ma non leggibili
  - 08.Q.R02_Computo_Metrico (computo_metrico) — non estratto:
    strategy-auditor non puo' leggerlo, Analisi 2 uscira' parziale

OK
  - 87 documenti con almeno un criterio collegato
  - scope.md presente (confidence: verificato)
  - economic_framework.md presente (confidence: parziale)
```
