# Sprint 3 — Fasi discrete, handoff, telemetria

## Cosa è stato costruito

- **`spada-fase <slug> <n> [--riesegui|--approva]`**
  (`_pipeline/scripts/setup/spada_fase.sh`, esposto sul PATH da
  `link_pipeline.sh` in `~/.local/bin`): comando unico per eseguire
  ciascuna delle sette fasi come invocazione `claude -p` a sé stante,
  cwd nella gara, pipeline risolta da `~/.claude` (Sprint 1).
  - Registra ogni run in `_state/run_log.json` **prima** di invocare
    `claude`, con `pipeline_version` (da `VERSION` + short SHA git di
    `_pipeline/`) e `prezzario_version` (interrogando `spada.db`
    direttamente, se la gara consulta un prezzario importato).
  - Le fasi 3, 5, 7 (intervento umano) non chiudono da sole: restano
    `richiede_approvazione: true` finché non si esegue
    `spada-fase <slug> <n> --approva`. Le fasi 5 e 7 non invocano
    affatto `claude -p` senza `--approva` — riportano solo lo stato
    corrente (proposte in registro / bozza offerta).
  - `--riesegui`: archivia l'handoff precedente in
    `output/_archivio/<timestamp>/<fase>/` (mai cancellato) e marca le
    fasi a valle già `completata` come `da_rivedere` — mai le cancella.
  - **Verifica anti-fabbricazione**: se `claude -p` esce con codice 0
    ma non ha scritto `_state/handoff/<fase>.json`, la fase è comunque
    marcata `errore` in `run_log.json` e `fasi.json` — un handoff
    mancante rompe la catena verso la fase successiva e non va
    ignorato solo perché il processo non è crashato.

- **Template di prompt per fase** (`_pipeline/comandi/fasi/*.md`):
  1, 2, 3, 4, 6 istruiscono l'agente a scrivere l'handoff e ad
  aggiornare `_state/memoria.md`; 5 e 7 sono gestite direttamente da
  `spada_fase.sh` (nessun template, sono gate umani puri).

- **Schema handoff** (`_pipeline/schemas/handoff.schema.json`): forma
  minima comune (`entita_chiave`, `riferimenti`, `alert`,
  `decisioni`, `vincoli_rilevati`) — regola esplicita: ogni riferimento
  deve puntare a un file o nodo realmente esistente, mai un riassunto
  non ancorato.

- **Telemetria** (`_pipeline/scripts/telemetry/attivita_hook.py`,
  registrato in `_pipeline/settings.json` su `PreToolUse` [matcher
  `Task`], `SubagentStop`, `Stop`): scrive incrementalmente
  `_state/attivita.json` (agenti attivi/conclusi) e, allo `Stop`,
  rigenera la `sintesi` in linguaggio naturale del `_state/fasi.json`
  per la fase corrente.

## Verifica eseguita (senza spendere invocazioni reali dell'API)

Ho validato la meccanica di `spada_fase.sh` con uno **shim locale** al
posto del binario `claude` (scrive l'handoff e un digest fittizio,
esce 0) — non ho fatto girare una fase reale con agenti veri, per non
consumare token/costo reale senza autorizzazione esplicita a farlo:

- esecuzione normale: `run_log.json` e `fasi.json` aggiornati
  correttamente (avvio → in_esecuzione → completata)
- `--riesegui`: archivio creato, fasi a valle marcate `da_rivedere`
  senza perdita di dati
- fase 5 senza `--approva`: nessuna invocazione `claude`, solo stato
- fase 5/7 con `--approva`: marcata completata, run_log registra
  l'approvazione (modello `n/a`, nessuna invocazione)
- **handoff mancante**: shim che non scrive l'handoff → fase marcata
  `errore` sia in `fasi.json` che in `run_log.json`, messaggio
  esplicito — verifica del meccanismo anti-fabbricazione
- risoluzione di `PIPELINE_DIR` attraverso il symlink
  `~/.local/bin/spada-fase` (senza `SPADA_PIPELINE_DIR` esplicita):
  corretta

`attivita_hook.py` testato in isolamento simulando payload di
PreToolUse/SubagentStop/Stop da stdin: correlazione esatta tramite
`agent_id`/`tool_use_id` quando presente, fallback FIFO per
`agent_type` altrimenti.

## Rischio noto, non validato in questa sessione

**Il piano stesso segnala la telemetria via hook come il punto più a
rischio del progetto**, da validare su una fase reale prima di
estenderla. Non confermato in questa sessione (nessun accesso a una
sessione Claude Code reale con hook attivi su una fase con subagenti
paralleli):

- se `SubagentStop` include davvero un campo che correla
  univocamente al subagente lanciato (qui si assume `agent_id` sia
  comparabile al `tool_use_id` del `PreToolUse` corrispondente — non
  confermato dalla documentazione, il fallback FIFO-per-tipo copre il
  caso in cui non lo sia, ma "quale dei tre pdf-reader in parallelo è
  appena finito" potrebbe risultare comunque approssimato)
- se `--output-format stream-json` combinato con `--setting-sources
  user` e i tre hook produce esattamente il flusso atteso su una fase
  con `graph-builder` (8 invocazioni, 3 in parallelo per due round)

**Raccomandazione**: prima di generalizzare, eseguire `spada-fase
<gara-vera> 2` (la fase con più parallelismo) sulla VM con telemetria
attiva e ispezionare `_state/attivita.json` durante l'esecuzione.

## Non ancora fatto

- Idempotenza "vera" oltre l'archiviazione: la Fase 2
  (`graph-builder`) già dichiara nel proprio file agente di
  "riscrivere, non accodare" — `spada_fase.sh` non aggiunge altro oltre
  a marcare `da_rivedere`.
- Nessuna UI/API consuma ancora `attivita.json`/`fasi.json` (Sprint 4/6).
