# Checklist — Build Knowledge Graph

## Prima di iniziare
- [ ] Ho letto `references/graph-schema.md`
- [ ] Ho letto `PROJECT_CONFIG.json` (nome gara, prezzario_riferimento)
- [ ] Esiste `03_criteria/criteria_matrix.md`
- [ ] Esiste almeno un file in `01_extracted/text/`
- [ ] Ho cercato l'elenco elaborati in `00_input/elaborati/`

## Fase A — Elenco elaborati
- [ ] Ho localizzato l'elenco elaborati (o documentato la sua assenza)
- [ ] Ho estratto: ID, nome file, sezione, descrizione per ogni elaborato
- [ ] Ho segnalato file nel filesystem non nell'elenco (orphan_input)
- [ ] Ho segnalato file nell'elenco non trovati nel filesystem (missing)

## Fase B — Censimento
- [ ] Ho eseguito `find` per tutti i PDF/p7m in `00_input/`
- [ ] Ho riconciliato con il manifest `_manifest_input.md`

## Fase C — Estrazione contenuto
- [ ] Ho letto i documenti numerici disponibili (computo, QE, stima)
- [ ] Ho marcato `TBD` i dati non estratti (non inventato nulla)
- [ ] Ho impostato `confidence` corretto per ogni dato estratto

## Fase D — Pagine speciali
- [ ] `02_graph/economic_framework.md` creata con tutti i campi
- [ ] `02_graph/scope.md` creata con lavorazioni e limiti di modifica
- [ ] I TBD sono espliciti dove i dati mancano

## Fase E — Pagine nodo documento
- [ ] Una pagina `02_graph/nodes/[codice]_[descrizione].md` per ogni documento
- [ ] Ogni pagina ha il preambolo "Per Claude futuro"
- [ ] Ogni pagina ha `supports_criteria` con almeno un criterio e `reason`
- [ ] Le tavole hanno `status: non_estratto` e `confidence: inferito`
- [ ] Le versioni multiple hanno `is_latest` corretto e archi versione

## Fase F — Archi doc->doc
- [ ] Ho cercato riferimenti espliciti nel testo per ogni doc estratto
- [ ] Ho creato archi strutturali (tavola/relazione, stesso lotto)
- [ ] Ogni arco ha `type` e `reason`
- [ ] Ho aggiornato le pagine gia' scritte con i nuovi archi

## Fase G — Arricchimento criteri
- [ ] Ogni pagina criterio ha `supported_by` aggiornato
- [ ] `modification_limits` e `fuori_scope_risks` presenti o segnati TBD
- [ ] `graph_updated` impostato con la data odierna

## Fase H — index.md e log.md
- [ ] `index.md` rigenerato (non accodato) con la sezione orfani
- [ ] La sezione orfani e' vuota o ogni orfano e' giustificato
- [ ] `log.md` ha l'entry di ingest con il formato `## [data] ingest | ...`

## Verifica finale
- [ ] Nessun campo numerico senza livello di confidence
- [ ] Nessun wikilink a pagina inesistente senza stub
- [ ] Nessun campo vuoto (TBD esplicito se il dato manca)
- [ ] Nessuna tavola con `status: estratto`
- [ ] I dati in `scope.md` e `economic_framework.md` provengono
      dalla versione `is_latest: true` di ogni documento
