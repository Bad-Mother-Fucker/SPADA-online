---
name: build-knowledge-graph
description: Usa quando devi costruire o ricostruire il knowledge graph della gara in 02_graph/ (Fase 1 Step 3, o su re-ingest di un elaborato aggiornato). Procedura operativa per le fasi A-H: ingest, pagine nodo, archi, scope, cornice economica, index e log.
---

# Skill — Build Knowledge Graph

## Pattern di riferimento

Questa skill implementa il pattern obsidian-second-brain v2 adattato
al dominio gare d'appalto. I principi che governano ogni operazione:

- **Rewrite not append**: le pagine esistenti vengono riscritte con
  nuove informazioni, non estese. Un ingest che crea solo nuove pagine
  senza riscrivere niente non e' stato abbastanza profondo.
- **Parallel subagents**: le categorie di documento (economici,
  testuali, tavole, archi, contraddizioni, criteri) vengono processate
  da subagenti distinti, non sequenzialmente nel contesto principale.
- **Two-Output Rule**: ogni documento processato genera la sua pagina
  nodo E un aggiornamento dell'index.md. Non si scrivono pagine senza
  aggiornare l'index.
- **Anti-fabrication**: TBD al posto di qualsiasi valore non
  verificabile. La falsa assenza e' piu' pericolosa della falsa
  presenza — cerca prima di dichiarare mancante.
- **Synthesis hook**: tre o piu' documenti con lo stesso tema ricorrente
  attivano la creazione di una pagina di sintesi in 02_graph/synthesis/.

Per la logica di orchestrazione dei subagenti vedi
`.claude/agents/graph-builder.md`.
Questa skill contiene il dettaglio operativo di ogni fase.

---

## Schema di riferimento

Leggi `references/graph-schema.md` prima di scrivere qualsiasi pagina.
Contiene i frontmatter per tipo nodo, il catalogo dei tipi di arco e le
regole anti-fabrication. Non procedere senza averlo letto.

---

## Input obbligatori

- `input/elaborati/` — tutti gli elaborati della gara
- `output/01_extracted/text/` — testi gia' estratti da `document-preprocessor`
- `output/01_extracted/extraction_log.md` — stato delle estrazioni
- `input/_manifest_input.md` — censimento file con ID
- `output/03_criteria/criteria_matrix.md` — criteri e subcriteri
- `output/03_criteria/criteria/criterion_Cx.md` — pagine criterio (create
  da `disciplinare-analyst`; graph-builder le ARRICCHISCE nel frontmatter)
- `manifest.json` — nome gara e `prezzario_riferimento`
- `02_graph/index.md` — SE ESISTE: leggi prima di scrivere qualsiasi
  pagina per rilevare cosa e' gia' presente nel grafo

---

## Fase A — Elenco elaborati (fonte autoritativa)

Cerca il documento "elenco elaborati":

```bash
find input/elaborati -iname "*elenco*elaborati*" -o -iname "*00*R00*" \
  -o -iname "*indice*elaborati*" 2>/dev/null | head -5
```

Se trovato: costruisci mappa `{ filename: descrizione_ufficiale }`.
Se non trovato: usa nome file + sezione. Imposta `confidence: inferito`
su tutti i nodi costruiti da filename.

## Fase B — Censimento e riconciliazione

```bash
find input -type f \( -name "*.pdf" -o -name "*.PDF" \
  -o -name "*.p7m" \) | sort
```

Riconcilia con il manifest:
- File nel filesystem ma non nell'elenco → `orphan_input` in log
- File nell'elenco ma non nel filesystem → `missing` in log

Classifica ogni file: `subtype`, sezione, tipo. Separa in:
- Lista ECONOMICI (sezione 08, sezione 09 R05)
- Lista TESTUALI (relazioni, PSC, capitolato, cronoprogramma)
- Lista TAVOLE (file tipo tavola)
- Lista ALTRO

## Fase C — Estrazione contenuto (ibrida e mirata)

**Documenti numerici** (Lista ECONOMICI): se il .md esiste in
`output/01_extracted/text/`, leggi e estrai entita' strutturate.
Se non estratto: richiedi estrazione a `document-preprocessor` (Fase C
dell'agente preprocessor). Se non ottenibile: scrivi `TBD`.

**Documenti testuali** (Lista TESTUALI): leggi il .md estratto.
Per le relazioni principali (01.R01, PSC), se il .md manca richiedine
l'estrazione.

**Tavole**: nessuna estrazione. Pagine leggere da elenco/filename.

Nota: estrazione e' eseguita nei subagenti, non nel contesto principale.

## Fase D — Scrittura pagine speciali (Subagente A)

**`02_graph/economic_framework.md`**:
- Da 08.R04: `importo_lavori`, `oneri_sicurezza`, `somme_a_disposizione`
- Da 09.R05: `importo_oneri_sicurezza`
- Se discordanti: documenta contraddizione con entrambe le fonti
- Calcola `oneri_sicurezza_pct`
- Tutto non estratto: `TBD` con commento `# da estrarre`

**`02_graph/scope.md`**:
- Da 08.R02: tabella lavorazioni (voce, descrizione, quantita',
  prezzo unitario, importo, categoria)
- Dai campi `modification_limits` e `fuori_scope_risks` delle pagine
  criterio: sezione "Limiti di modifica imposti dal disciplinare"
- Confidence per ogni riga della tabella lavorazioni
- Regola d'uso per gli agenti nel corpo della pagina

## Fase E — Scrittura pagine nodo documento (Subagenti B e C)

**Regola REWRITE not APPEND:**
Se la pagina esiste: leggi il suo contenuto attuale, poi RISCRIVILA
integrando le nuove informazioni. Non accodare.

**Nome file output:** `02_graph/nodes/[codice]_[descrizione].md`, dove
`[codice]` e' il codice progetto estratto dal nome file
(es. `02_graph/nodes/08.Q.R02_Computo_Metrico.md`). Nessun ID interno.

Per ogni pagina nodo documento:
1. Determina `subtype` da elenco elaborati e/o nome file e sezione
2. `confidence`: `verificato` se letto dal testo estratto,
   `inferito` se da elenco/filename, `parziale` se estrazione parziale
3. `supports_criteria` con `reason` non vuoto — mai wikilink nudo
4. `related_documents` inizializzato vuoto (il Subagente D lo popola)
5. Preambolo "Per Claude futuro" secondo template in graph-schema.md
6. Corpo "Contenuto chiave": entita' COMPILATE (non testo integrale)
7. Corpo "Riferimenti a altri elaborati": lista codici citati nel testo

## Fase F — Rilevamento archi documento-documento (Subagente D)

**Riferimenti espliciti nel testo** (da sezione "Riferimenti" delle
pagine nodo scritte in Fase E):
- Codice elaborato citato → arco `references` + `referenced_by`

**Raggruppamenti strutturali** (senza leggere il testo):
- Stessa sezione: tavola → relazione: arco `tavola_di` / `relazione_di`
- 08.R02 → 01.R01: arco `computo_di`
- Stesso `version_group`: arco `versione_precedente` / `versione_successiva`
- Stessa sezione discipline diverse: arco `stesso_lotto`

Aggiorna le pagine con REWRITE della sola sezione `related_documents`.

## Fase G — Arricchimento pagine criterio (Subagente F)

Per ogni `output/03_criteria/criteria/criterion_Cx.md`:
1. Scansiona tutte le pagine nodo, raccogli quelle con `[[Cx]]`
   in `supports_criteria`
2. Aggiungi al FRONTMATTER (non al corpo):
   ```yaml
   supported_by:
     - { doc: "[[08.Q.R02_Computo_Metrico]]", priority: alta }
   graph_updated: YYYY-MM-DD
   ```
3. `modification_limits` e `fuori_scope_risks`: non toccare se gia'
   presenti; aggiungere come liste vuote `[]` se assenti

## Fase H — Rebuild index.md e append log.md

**index.md**: RIGENERA completamente. Non accodare — ricostruisci.
Includi: header, pagine speciali, tabella criteri, tabella documenti
per sezione, sezione orfani (ALERT), contraddizioni, statistiche.

**log.md**: APPENDI entry con formato:
```
## [YYYY-MM-DD] ingest | [gara.nome] — N create, M riscritte, K orfani, Z contraddizioni
```

---

## Regola speciale: gestione versioni di progetto

Piu' versioni dello stesso documento (stesso `version_group`):
1. Ordina per data nel nome file o nel testo
2. Piu' recente: `is_latest: true`; altre: `is_latest: false`
3. Archi `versione_precedente` + `versione_successiva` bidirezionali
4. `scope.md` e `economic_framework.md`: usa SOLO dati da `is_latest: true`
5. Preambolo della versione nuova: "Aggiorna [[codice-versione-precedente]] (is_latest: false)."

---

## Output

Obbligatori:
- `02_graph/index.md` — rigenerato
- `02_graph/log.md` — entry appesa
- `02_graph/nodes/[codice]_[descrizione].md` — una per documento
- `02_graph/scope.md`
- `02_graph/economic_framework.md`
- `output/03_criteria/criteria/criterion_Cx.md` — frontmatter aggiornato
- `02_graph/synthesis/*.md` — se synthesis hook attivato

---

## Come gli agenti a valle usano il grafo

Passo 1: leggi `02_graph/index.md`. Identifica pagine rilevanti.
Passo 2: apri pagine nodo (`supports_criteria` con priority `alta`),
es. `[[08.Q.R02_Computo_Metrico]]`, `[[01.G.R01_Relazione_Generale]]`.
Passo 3: segui archi `related_documents` per documenti collegati.
Passo 4: leggi `02_graph/economic_framework.md` e `scope.md`.
Passo 5: approfondimento on-demand via `pdf-reader` o `drawing-reader`.

---

## AI-First Rule (ogni pagina scritta)

Segue `references/graph-schema.md`:
- Preambolo `## Per Claude futuro` dopo il frontmatter
- Frontmatter ricco: `type`, `date`, `gara`, `ai-first: true` + campi tipo
- Confidence level su ogni dato numerico
- Wikilink obbligatori per documento o criterio referenziato
- Fonti: codice documento + sezione dove possibile
- TBD al posto di qualsiasi valore non verificabile

**Anti-fabrication**: cerca prima di dichiarare assente. Non inventare
importi, voci o contenuti. Non inferire rilevanza senza supporto.
