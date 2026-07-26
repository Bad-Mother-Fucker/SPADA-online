# Sprint 1 — Inventario di `_riferimento/` (prometeus-spada)

Mappa di cosa esiste nel repo di riferimento (clonato in sola lettura,
non toccato), con l'indicazione di cosa viene portato così com'è, cosa
va adattato e cosa non serve più nel modello a pipeline condivisa.

Fonte: `Bad-Mother-Fucker/prometeus-spada` @ commit corrente al momento
dell'inventario. Nessun file di quel repo è stato modificato, creato
branch o fatto commit/push — vincolo verificato a fine sprint (vedi
`git status` in fondo a questo documento).

## Agenti (`.claude/agents/*.md`)

| Agente | Verdetto | Nota |
|---|---|---|
| `disciplinare-analyst` | **così com'è** | Nessuna assunzione sul modello a template; opera su path relativi alla gara (`00_input/`, `03_criteria/`) che restano invariati. |
| `document-preprocessor` | **così com'è** | Idem. Bash consentito solo per estrazione PDF/p7m — regola invariata. |
| `graph-builder` | **così com'è** | Fasi 0-5 invocate dal main loop, nessun riferimento a percorsi di sistema. |
| `strategy-auditor` | **adattato** | Sprint 2 sostituisce la lettura di indici JSON prezzario con query al server MCP `prezzario`. La logica delle 4 analisi resta identica. |
| `pdf-reader` | **così com'è** | — |
| `drawing-reader` | **così com'è** | — |
| `criterion-agent` | **adattato** | Sprint 2: userà il server MCP prezzario invece della skill `prezzario` a indice JSON, dove confronta prezzi. Struttura output invariata. |
| `evidence-auditor` | **così com'è** | — |
| `feedback-processor` | **così com'è** | — |
| `offer-writer` | **così com'è** | — |
| `context-monitor` | **adattato** | Nel nuovo modello scrive anche `_state/fasi.json` e aggiorna `_state/handoff/<fase>.json` (Sprint 3), oltre allo snapshot esistente. |
| `document-indexer` (`_archive/`) | **non serve più** | Già archiviato nel repo di riferimento stesso (sostituito da `graph-builder`). Non portato. |

## Skill (`.claude/skills/*/SKILL.md`)

| Skill | Verdetto | Nota |
|---|---|---|
| `build-knowledge-graph` | così com'è | — |
| `criterion-output-audit` | così com'è | — |
| `extract-criteria-from-disciplinary` | così com'è | — |
| `graph-lint` | così com'è | — |
| `handle-p7m-files` | così com'è | — |
| `read-technical-drawings` | così com'è | — |
| `strategy-audit` | adattato | riferimenti al prezzario ad indice → server MCP (Sprint 2) |
| `prezzario` (indice JSON) | **non serve più** | Sprint 2 la sostituisce interamente con il server MCP `_pipeline/mcp/prezzario/`. Non portata: il contratto (query, non caricamento indice) cambia radicalmente. |

## Comandi (`.claude/commands/*.md`)

| Comando | Verdetto | Nota |
|---|---|---|
| `analyze_criterion`, `analyze_multiple_criteria`, `analyze_disciplinare`, `graph_health`, `process_feedback`, `resolve_orphan`, `run_strategy_audit`, `update_document` | così com'è | Logica di orchestrazione invariata: sono istruzioni al main loop, non codice legato al filesystem del template. |
| `new_bid` | **adattato** | Non fa più assunzioni su "già presente nel repo clonato": la struttura dati la crea `new_gara.sh` nuovo (Sprint 1.4), non il clone. |
| `start_bid_analysis` | così com'è | — |
| `snapshot_context` | **adattato** | Aggiorna anche `_state/fasi.json` / `_state/attivita.json` (Sprint 3). |
| `sync_output` | **non serve più così com'è** | Il repo di output per-gara (`prometeus-spada-output`) era una soluzione per il modello a clone locale. Nel modello online l'output vive in `gare/<slug>/output/` con `.git` proprio (vedi struttura target) e/o è servito dal backend; la sincronizzazione a un repo condiviso esterno non è più il meccanismo primario. Riferimento conservato in questo inventario, non portato in Sprint 1. Da rivalutare in Sprint 9 (backup). |

## Script (`scripts/`)

| Script | Verdetto | Nota |
|---|---|---|
| `scripts/render/md_to_html.js` | così com'è | Genera gli artifact HTML dai `.md` — logica invariata, verrà risolto da path condiviso. |
| `scripts/render/render_hook.sh` | così com'è | Hook `PostToolUse`; nel nuovo modello vive in `_pipeline/`, non nella gara. |
| `scripts/graph/graph_lint.js` | così com'è | — |
| `scripts/offer/md_to_docx.js` | così com'è | — |
| `scripts/prezzario/fetch_prezzario.sh` | **superato da Sprint 2** | Scarica JSON da `prometeus-prezzari` in cache locale. Portato in Sprint 1 solo come transitorio (compatibilità), sarà rimosso quando il server MCP interroga direttamente `spada.db` (Sprint 2). |
| `scripts/setup/new_gara.sh` | **riscritto da zero** | Il vecchio clona l'intero repo SPADA per gara (modello a template). Il nuovo (Sprint 1.4) crea solo dati + `manifest.json`, non copia codice. |
| `scripts/setup/update_gare.sh` | **non ricreato** | Esisteva solo per propagare aggiornamenti a cloni per-gara. Nel modello condiviso la pipeline è sempre la versione corrente: non serve propagazione. |

## Altri file di sistema

| File | Verdetto | Nota |
|---|---|---|
| `CLAUDE.md` | **adattato, in due parti** | La parte "chi sei / regole di ingaggio / workflow / standard di output" è pipeline (va in `_pipeline/`, letta ad ogni fase). La parte di stato sessione (§0, riepilogo gara) resta per-gara, ricostruita da `manifest.json` + `_state/*.json` invece che da un unico file monolitico letto a mano a ogni avvio interattivo — nel modello a fasi discrete (Sprint 3) non c'è più una sessione interattiva lunga, ogni fase è un'invocazione `claude -p` a sé stante che carica `_state/memoria.md` + handoff pertinenti. |
| `PROJECT_CONFIG.json` | **sostituito** | Diventa `manifest.json` (dati statici di gara: nome, regione/anno prezzario, modello, effort) + `_state/fasi.json` (stato dinamico) — vedi Sprint 1.7 per gli schemi. |
| `references/graph-schema.md` | così com'è | — |
| `vincoli_offerta_tecnica.md` | così com'è (per-gara) | Resta un file compilato dal professionista per singola gara, non pipeline. Vive in `gare/<slug>/`. |
| `.claude/settings.json` (hook `PostToolUse`) | **adattato** | Vive in `_pipeline/`; il meccanismo di risoluzione da working dir di gara è discusso sotto. |
| `package.json` (dipendenza `docx`) | così com'è | Segue `md_to_docx.js` in `_pipeline/`. |

## Nodo critico: come una gara "vede" la pipeline condivisa

Verificato (Sprint 1.6, ricerca su documentazione Claude Code corrente):
non esiste oggi un flag CLI o una chiave di `settings.json` che permetta
di *risolvere* agenti/skill/comandi/hook da una directory condivisa
arbitraria mentre la working directory resta quella della gara:

- `--settings <file>` sovrascrive singoli **valori** di configurazione
  per la sessione, non **percorsi di discovery**.
- `--setting-sources user,project,local` sceglie quali *scope già noti*
  caricare (`~/.claude`, `.claude/` in cwd, `.claude/settings.local.json`),
  non un percorso arbitrario.
- `--add-dir` concede accesso ai file di una directory aggiuntiva ma,
  per documentazione esplicita, **non ne carica la configurazione
  `.claude/`** (agenti/skill/comandi/hook restano non scoperti).
- Non esiste una `CLAUDE_CONFIG_DIR` per rilocare l'intero `~/.claude`
  in modo documentato e stabile.

Il meccanismo realmente supportato, dato un solo operatore e una VM
dedicata, è: **`~/.claude/` sulla VM È la pipeline condivisa**. Ogni
gara non ha `.claude/` proprio; l'utente Linux con cui gira Claude Code
ha `~/.claude/agents`, `~/.claude/skills`, `~/.claude/commands`,
`~/.claude/settings.json` come **symlink** verso
`_pipeline/agents`, `_pipeline/skills`, `_pipeline/comandi`,
`_pipeline/settings.json`. Questo soddisfa i principi non negoziabili:

- un aggiornamento di `_pipeline/` è immediatamente live (il symlink
  punta sempre al contenuto corrente, nessuna copia da propagare);
- la cartella di gara contiene solo dati (nessun file `.claude/` al
  suo interno);
- `claude -p` invocato con cwd nella gara usa quella cwd per
  lettura/scrittura file, e risolve agenti/skill/comandi/hook da
  `~/.claude/` (scope *user*), che è il symlink verso `_pipeline/`.

Non è un vincolo di questo progetto ma della piattaforma Claude Code
così com'è oggi: annotato qui perché il piano originale ipotizzava
`--settings`/`setting_sources` come meccanismo, e va corretto nella
pipeline invece che nel repo di riferimento. Dettagli operativi e
script di provisioning in `_pipeline/README.md` §Risoluzione pipeline.

## Verifica repo di riferimento non toccato

```
$ git -C /home/user/prometeus-spada status --short
(vuoto)
$ git -C /home/user/prometeus-spada branch --show-current
claude/spada-sprint-1-pipeline-9qcsns   ← branch pre-esistente nel checkout locale di sessione, nessun commit aggiunto
```

Nessun file scritto, nessun commit, nessun push su
`Bad-Mother-Fucker/prometeus-spada` durante questo sprint.
