# Graph Schema — Note AI-First per Gare d'Appalto

Il knowledge graph e' scritto per **Claude futuro**, non per la lettura
umana diretta. Ogni agente che scrive nel grafo applica queste regole
senza eccezioni. Questo documento e' la specifica canonica.

---

## Principio fondamentale — nomenclatura del progetto

Il sistema usa la nomenclatura degli elaborati cosi' come definita dal
progettista. Non viene assegnata nessuna numerazione interna.

Il codice identificativo di ogni documento e' quello che compare nel
nome del file e nell'elenco elaborati (es. `08.Q.R02`, `01.G.R01`,
`09.S.T03`). Questo codice diventa:
- Il nome del file nodo: `02_graph/nodes/08.Q.R02_Computo_Metrico.md`
- Il wikilink: `[[08.Q.R02_Computo_Metrico]]`
- L'identificatore in tutti i frontmatter e nei campi di evidenza

Se un file non ha un codice riconoscibile nel nome, si usa il filename
stem intero come identificatore.

---

## Le 7 Regole AI-First

### 1. Contesto autosufficiente
Ogni pagina deve spiegarsi da sola senza contesto circostante.

### 2. Preambolo "Per Claude futuro"
Ogni pagina inizia con un riepilogo sotto `## Per Claude futuro`
immediatamente dopo il frontmatter.

### 3. Frontmatter ricco e consistente
Campi universali su ogni nodo:
```yaml
type: <tipo-nodo>
gara: "[nome gara da PROJECT_CONFIG]"
date: YYYY-MM-DD
ai-first: true
```

### 4. Marcatori di confidenza

| Livello | Significato |
|---|---|
| `verificato` | Letto direttamente dal testo estratto |
| `inferito` | Derivato da nome file o elenco elaborati senza lettura integrale |
| `parziale` | Testo estratto incompleto (PDF scansionato) |
| `TBD` | Confidenza non determinabile — la pagina non ha ancora dati sufficienti |

`TBD` **e' un quarto valore ammesso** per il campo `confidence`, non un
segnaposto da sostituire: significa "non so ancora quanto e' affidabile
questa pagina". Va usato quando tutti i dati della pagina sono a loro
volta `TBD` (es. `economic_framework.md` prima dell'estrazione degli
economici). Appena un dato viene verificato, `confidence` sale al
livello corrispondente.

**Confidence per-pagina e per-singolo-dato.** Il campo `confidence` nel
frontmatter vale per la pagina nel suo complesso. Ogni singolo dato
numerico porta pero' la propria confidenza, perche' una pagina
`verificato` puo' contenere un valore inferito:

```markdown
- Importo lavori: € 2.340.000 <!-- confidence: verificato, [[08.Q.R04_Quadro_Economico]] sez. 2 -->
- Oneri sicurezza: € 78.000 <!-- confidence: inferito, calcolato come 3,3% dell'importo lavori -->
- Somme a disposizione: TBD <!-- confidence: TBD, quadro economico non estratto -->
```

Nelle tabelle, usa una colonna `Confidence` esplicita invece del
commento. Nel frontmatter, l'annotazione si mette sulla riga della
voce:

```yaml
cost_summary:
  totale_eur: 2340000        # confidence: verificato
  voci_count: TBD            # confidence: TBD
```

Regola: `confidence` della pagina = il **minimo** tra le confidenze dei
suoi dati chiave. Una pagina con un solo dato `inferito` non e'
`verificato`.

### 5. Fonti preservate
Ogni dato estratto indica il documento con wikilink e sezione.

### 6. Wikilink obbligatori
Ogni riferimento a un documento o criterio usa `[[wikilink]]`.

### 7. TBD al posto di invenzioni
Se un dato non e' verificabile: `TBD`. Mai lasciare vuoto. Mai inventare.

---

## Anti-Fabrication

- Non inventare importi — se non nel testo: `TBD`
- Non inventare voci di computo — se non estratte: `[]`
- Non inferire rilevanza su un criterio senza supporto dall'elenco o dal testo
- Non dichiarare assente un file senza aver eseguito `find`
- Non riscrivere una pagina con dati meno precisi di quelli gia' presenti

---

## Schemi Frontmatter per Tipo Nodo

### Tipo: `document`
File: `02_graph/nodes/[codice-progetto]_[descrizione].md`

```yaml
---
type: document
subtype: computo_metrico
# Subtype validi:
#   relazione_generale | relazione_tecnica | tavola | computo_metrico |
#   elenco_prezzi | quadro_economico | stima_sicurezza | PSC |
#   cronoprogramma | capitolato | piano_esproprio | quadro_manodopera | altro
gara: "[nome gara]"
date: YYYY-MM-DD
ai-first: true
codice: "08.Q.R02"
file: "08.Q.R02_Computo_Metrico_Estimativo.pdf"
section: "08"
version_group: "computo"
is_latest: true
status: estratto             # estratto | non_estratto
extracted_md: "01_extracted/text/08.Q.R02_Computo_Metrico.md"
confidence: verificato
supports_criteria:
  - { criterion: "[[C1]]", priority: alta, reason: "Importi di riferimento per le opere del criterio" }
related_documents:
  - { doc: "[[01.G.R01_Relazione_Generale]]", type: referenced_by, reason: "La relazione cita le voci del computo" }
cost_summary:
  totale_eur: TBD
  voci_count: TBD
---
```

### Tipo: `criterion` (arricchimento frontmatter)
Le pagine criterio esistono gia'. `graph-builder` aggiunge SOLO:

```yaml
# Aggiunto da graph-builder
supported_by:
  - { doc: "[[08.Q.R02_Computo_Metrico]]", priority: alta }
modification_limits:
  - "[vincolo letterale dal disciplinare con riferimento articolo]"
fuori_scope_risks:
  - "[rischio fuori scope identificato]"
graph_updated: YYYY-MM-DD
```

### Tipo: `scope` — Pagina speciale
File: `02_graph/scope.md`

```yaml
---
type: scope
gara: "[nome gara]"
date: YYYY-MM-DD
ai-first: true
fonte_lavorazioni: "[[08.Q.R02_Computo_Metrico]]"
fonte_vincoli: ["[[C1]]", "[[C2]]", "disciplinare sez. X"]
confidence: verificato
---
```

### Tipo: `economic_framework` — Pagina speciale
File: `02_graph/economic_framework.md`

```yaml
---
type: economic_framework
gara: "[nome gara]"
date: YYYY-MM-DD
ai-first: true
importo_lavori_eur: TBD
oneri_sicurezza_eur: TBD
oneri_sicurezza_pct: TBD
fonte_qe: "[[08.Q.R04_Quadro_Economico]]"
fonte_sicurezza: ["[[09.S.R05_Stima_Sicurezza]]"]
confidence: TBD
---
```

### Tipo: `proposal` — Nodo proposta approvata
File: `02_graph/proposals/P-[criterio]-[num]_[titolo-breve].md`
Creato da `feedback-processor` dopo elaborazione feedback.

```yaml
---
type: proposal
gara: "[nome gara]"
date: YYYY-MM-DD
ai-first: true
id: "P-C1-001"
criterio: "[[C1]]"
sottocriterio: "C1.2"
titolo: "[titolo proposta]"
stato: approvata             # approvata | approvata_con_modifiche
confidence: verificato       # forza dell'evidenza a supporto della proposta
punteggio_stimato: 4         # confidence: inferito
evidence_documents:
  - { doc: "[[08.Q.R02_Computo_Metrico]]",   sezione: "Rete principale p. 12", estratto: "1.200 m collettore PVC DN400 voce 1.2.3" }
  - { doc: "[[01.G.R01_Relazione_Idraulica]]", sezione: "sez. 4.3",            estratto: "portate di punta superiori a 150 l/s" }
feedback_professionista: "[note del professionista dalla fase di feedback]"
---
```

---

## Catalogo Tipi di Arco

| Tipo | Significato | Regola che lo genera |
|---|---|---|
| `references` | Il documento A cita esplicitamente il documento B | Fase F — codice elaborato citato nel testo |
| `referenced_by` | Il documento A e' citato dal documento B | Fase F — inverso di `references` |
| `tavola_di` | La tavola illustra le opere della relazione | Fase F — stessa sezione, tavola → relazione |
| `relazione_di` | La relazione descrive le opere nella tavola | Fase F — inverso di `tavola_di` |
| `computo_di` | Il computo misura le opere della relazione | Fase F — 08.R02 → 01.R01 |
| `versione_precedente` | Documento superato da versione piu' recente | Fase F — stesso `version_group`, data anteriore |
| `versione_successiva` | Documento che aggiorna il precedente | Fase F — inverso di `versione_precedente` |
| `stesso_lotto` | Stessa sezione/lotto, discipline diverse | Fase F — stessa sezione, `subtype` diversi |

Ogni arco del catalogo ha una regola operativa che lo genera. Un tipo di
arco senza regola non viene mai prodotto e non va aggiunto qui: il
catalogo descrive cosa il grafo contiene davvero, non cosa potrebbe
contenere.

---

## Regola di assegnazione `version_group`

Due file appartengono allo stesso `version_group` — cioe' sono versioni
dello stesso elaborato — quando hanno **sia** lo stesso codice
progetto **sia** lo stesso `subtype`:

```
08.Q.R02_Computo_Metrico.pdf              → version_group: "08.Q.R02"
08.Q.R02_Computo_Metrico_rev2.pdf         → version_group: "08.Q.R02"   stessa serie
08.Q.R03_Quadro_Manodopera.pdf            → version_group: "08.Q.R03"   serie diversa
```

Il valore di `version_group` e' il **codice progetto senza suffissi**.
Se il codice non e' riconoscibile nel nome file, `version_group` e' il
filename stem privato del suffisso di revisione.

**Ordinamento all'interno del gruppo** — la prima regola che si applica
vince:

1. Data nel nome file (`_20260715`, `_2026-07-15`, `_15072026`)
2. Numero di revisione nel nome (`_rev2`, `_r2`, `_v2`, `_bis`) —
   numero piu' alto = piu' recente; un file senza suffisso e' la
   revisione 0, quindi la piu' vecchia
3. Data di emissione letta nel testo o nel cartiglio
4. Se nessuna delle tre e' disponibile: `is_latest: true` su **nessuno**
   dei file del gruppo, e la contraddizione va segnalata nel report.
   Non tirare a indovinare quale versione e' quella buona: usare i dati
   di una revisione superata e' un errore che si propaga fino
   all'offerta.

Il file piu' recente ha `is_latest: true`, tutti gli altri `false`.
`scope.md` ed `economic_framework.md` leggono **solo** da `is_latest: true`.

---

## Template Preamboli per Tipo

### Documento testuale
```markdown
## Per Claude futuro
Questo e' il [subtype] [codice] della gara [[PROJECT_CONFIG.gara.nome]].
[Descrizione ufficiale dall'elenco elaborati.] Contiene [entita' chiave].
Confidence: [livello].
```

### Tavola
```markdown
## Per Claude futuro
Questa e' la tavola [codice] della gara [[PROJECT_CONFIG.gara.nome]].
Rappresenta [oggetto grafico] per la sezione [xx].
Lettura approfondita differita a drawing-reader on-demand.
```

### Proposta
```markdown
## Per Claude futuro
Proposta [stato] per il criterio [[Cx]], sottocriterio [Cx.y].
[Sintesi della proposta in una frase.] Le evidenze documentali
sono nel frontmatter campo evidence_documents. Usarle direttamente
in fase di redazione dell'offerta tecnica.
```

---

## Anti-Pattern da Evitare

| Anti-pattern | Perche' e' sbagliato |
|---|---|
| Usare ID interni tipo `D045` | Il progetto ha gia' una nomenclatura — usarla |
| Archi senza `reason` | Inutile per il criterion-agent |
| Tavola con `status: estratto` | Le tavole sono immagini |
| Campo `TBD` omesso quando dato manca | `TBD` esplicito e' meglio di stringa vuota |
| Wikilink a file inesistenti senza stub | Creare sempre uno stub |
| `confidence: verificato` su dato da elenco | L'elenco non e' il documento: usare `inferito` |
| Nodo proposta creato prima del feedback | Solo feedback-processor crea nodi proposta |
