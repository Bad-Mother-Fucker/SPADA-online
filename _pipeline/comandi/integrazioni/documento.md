# Integrazione di un documento caricato dopo la Fase 2

Il prompt indica il documento (`input/...`). Il grafo esiste già: non
ricostruirlo, aggiungi solo questo documento. Nessuna fase va rieseguita.

## Esecuzione

1. **Censimento ed estrazione** — `document-preprocessor` in modalità
   incrementale (aggiunge il file a `input/_manifest_input.md`) e in
   Fase B (estrazione on-demand del solo documento in
   `output/01_extracted/text/`). Una tavola si censisce e non si
   estrae, come in Fase 1. Un `.p7m` si sbusta prima.
2. **Nuovo documento o nuova versione?** — cerca nel grafo una pagina
   nodo dello stesso `version_group` con `is_latest: true`
   (`references/graph-schema.md`).
   - **Nuova versione** → `graph-builder` in modalità re-ingest
     («Gestione re-ingest» nel suo file): pagina vecchia
     `is_latest: false`, pagina nuova, `scope.md` ed
     `economic_framework.md` riallineati, Fase E (contraddizioni) sui
     due documenti.
   - **Documento nuovo** → `graph-builder` su questo solo documento,
     con le stesse regole delle Fasi A/B/C per la sua categoria
     (economico, testuale, tavola), poi Fasi D, E, F ristrette ai suoi
     archi, alle contraddizioni con i documenti già nel grafo e ai
     criteri che sostiene. Poi Fase 4-5 di graph-builder (index, log,
     lint) — l'entry in `02_graph/log.md` è
     `## [YYYY-MM-DD] integrazione | [codice nomefile] | ...`.
   - **Chiarimento della stazione appaltante** (documento in
     `input/disciplinare/` o che modifica il disciplinare) → come sopra,
     e in più verifica se cambiano criteri, punteggi o vincoli in
     `output/03_criteria/criteria_matrix.md`: se cambiano, NON
     modificare la matrice: segnalalo nel brief come ATTENZIONE e
     registra una domanda `quesito_sa`/`amministrativa` per il
     professionista.
3. **Impatto sulle analisi già fatte** — per ogni criterio con
   `criteri_stato[Cx].analizzato: true` in `manifest.json` che il
   documento sostiene, annotalo: finirà nei «Prossimi passi» del brief
   come «valuta se rianalizzare Cx». Non rianalizzare nulla.
4. **Brief** — `brief-writer` con motivo «Integrazione di un documento»
   (sezioni: Documentazione di gara, Base di progetto dei criteri
   toccati, Quadro tecnico-economico se cambia, Vincoli, Prossimi passi,
   Storico).
5. **Domande** — se il documento fa nascere domande (discordanze nuove,
   dati che cambiano un valore di progetto, elaborati ancora mancanti),
   registrale con `domande.py aggiungi --origine integrazione ...`; se
   risponde a una domanda aperta, superala con `domande.py supera`.

## Alla fine

Aggiungi un paragrafo a `_state/memoria.md`: documento integrato, cosa
ha aggiunto o cambiato nel grafo, criteri toccati, domande aggiunte o
superate. Non scrivere handoff di fase e non toccare `_state/fasi.json`.
