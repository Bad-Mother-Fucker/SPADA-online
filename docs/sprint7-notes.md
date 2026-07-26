# Sprint 7 — Assistente di gara

## Cosa è stato costruito

- **`app/backend/assistente.py`**: costruisce il prompt (manifest +
  `_state/memoria.md` + domanda) e invoca `claude -p` in sola lettura:
  `--tools "Read,Grep,Glob"` (solo i tool nativi elencati; niente
  Write/Edit/Bash/Task) + `--disallowedTools` come difesa in
  profondità esplicita, incluso `mcp__prezzario__*` — il server
  prezzario è comunque di sole query, ma il divieto è dichiarato
  ugualmente per rendere l'intento leggibile senza dipendere
  dall'assenza di side-effect altrui.
- **`POST /gare/{slug}/assistente`**: gate su Fase 2 completata
  (`_state/fasi.json`) e su nessun job `in_esecuzione` per quella gara
  (una fase che sta scrivendo file e una sessione che li legge in
  parallelo romperebbe "sola lettura" nel senso che conta: niente
  interferenza con una scrittura in corso). Persiste sia il messaggio
  dell'utente sia la risposta in `conversazioni`.
- **`GET /gare/{slug}/assistente`**: cronologia conversazione persistita.

## Verifica eseguita

Backend avviato realmente con uno **shim** al posto del binario
`claude` (verifica che `--tools`/`--disallowedTools` siano
effettivamente passati, poi risponde con un testo fisso) — nessuna
invocazione reale dell'API, stesso limite di Sprint 4/6:
- richiesta prima del completamento Fase 2 → `409` esplicito
- dopo aver marcato Fase 2 completata → `200`, risposta persistita e
  restituita
- `GET` cronologia → entrambi i messaggi (utente + assistente) in ordine
- job `in_esecuzione` sulla stessa gara → `409`, l'assistente non parte

## Non ancora fatto

- Nessuna invocazione reale di `claude -p` in modalità assistente
  (richiede token OAuth reale — non eseguita senza autorizzazione
  esplicita). Il percorso di costruzione argomenti è verificato
  (lo shim fallisce se `--tools`/`--disallowedTools` non sono presenti
  esattamente come attesi), non il comportamento reale del modello.
- Nessuna UI per la cronologia conversazione nel frontend (Sprint 6 non
  la includeva esplicitamente tra i requisiti; l'endpoint è pronto,
  l'aggiunta a `gara.html` è naturale ma non fatta qui per restare
  dentro lo scope dichiarato di questo sprint).
