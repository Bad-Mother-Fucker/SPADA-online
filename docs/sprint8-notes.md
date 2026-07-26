# Sprint 8 — Ingestione incrementale

## Cosa è stato costruito

- **`POST /gare/{slug}/documenti`** (già esistente da Sprint 4, upload
  sempre possibile anche a gara avviata) ora risponde anche con
  `fasi_completate_da_valutare` (elenco numerico) e un messaggio
  esplicito — mai un rilancio automatico e silenzioso.
- **Frontend** (`gara.js`): dopo un upload, se ci sono fasi già
  completate, mostra un pannello dedicato con un pulsante "Riesegui
  Fase N" per ciascuna — l'operatore sceglie esplicitamente quale
  rivalutare, coerente con "chiede esplicitamente" del piano.
- **`--riesegui`** (già Sprint 3) marca le fasi a valle già completate
  come `da_rivedere`, mai le cancella; archivia l'handoff precedente in
  `output/_archivio/<timestamp>/` — verificato di nuovo qui end-to-end
  dal frontend, non solo da CLI.
- **`_pipeline/scripts/setup/verifica_completezza.py`** — gate
  bloccante nuovo, integrato in `spada_fase.sh` **solo prima della
  Fase 3**: legge `input/_manifest_input.md` (scritto da
  `document-preprocessor`, Fase 1) e blocca se un documento non di
  tipo tavola non risulta `Stato: estratto`. Chiude il difetto noto
  citato dal piano: un gap prezzi con categorie "non coperte" poteva
  dipendere da un'estrazione ancora incompleta, non da un'assenza reale
  dei dati di riferimento — prima non c'era una verifica esplicita che
  distinguesse i due casi.

## Verifica eseguita

- `verifica_completezza.py` testato con tre manifest sintetici:
  completo (exit 0), con un documento non estratto (exit 1, elenco
  puntuale su stderr), manifest assente (exit 1). Poi integrato in
  `spada_fase.sh` e verificato reale: `spada-fase <gara> 3` con un
  manifest incompleto si blocca **prima** di registrare il run (la fase
  resta `da_eseguire`, non `errore` — non è un fallimento della fase,
  è un prerequisito non ancora soddisfatto); dopo aver corretto il
  manifest (`Stato: estratto`), la stessa gara procede regolarmente
  fino al completamento (con uno shim al posto di `claude`, come negli
  altri sprint).
- Flusso di upload incrementale testato in **Chromium headless reale**
  (Playwright): gara con fasi 1 e 2 già `completata`, upload di un
  nuovo documento → pannello con due pulsanti proposti ("Riesegui Fase
  1", "Riesegui Fase 2") → click su uno → job di riesecuzione accodato
  con successo (verificato via API, non solo lettura del codice). Le
  fasi non passano subito a `da_rivedere` in questo test perché nessun
  worker reale ha consumato il job accodato — comportamento atteso,
  non un difetto: il marcamento avviene dentro `spada_fase.sh`
  all'esecuzione effettiva (Sprint 3), non all'accodamento.

## Non ancora fatto

- Il gate di completezza copre solo il caso esplicitamente citato dal
  piano (estrazione testuale prima della Fase 3). Non estende lo stesso
  principio ad altre fasi (es. verificare che tutte le tavole rilevanti
  per un criterio siano state lette da `drawing-reader` prima della
  Fase 4) — fuori dallo scope dichiarato di questo sprint.
- Nessun test end-to-end con un worker reale che consuma un job di
  riesecuzione e osserva `da_rivedere` comparire dal vivo nel
  frontend via SSE (richiederebbe autenticazione Claude reale, stesso
  limite di tutti gli sprint precedenti).
