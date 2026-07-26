# `_pipeline/` — pipeline condivisa SPADA Online

Agenti, skill, comandi, script e hook usati da **tutte** le gare. Una
gara non contiene mai una copia di questi file: li risolve da qui.
Vedi `docs/sprint1-inventario.md` alla radice del repo per la mappa
completa di cosa è stato portato da `_riferimento/` (il vecchio repo
`prometeus-spada`, mai modificato) e cosa è cambiato.

## Struttura

```
_pipeline/
├── VERSION              versione semver corrente (tag git corrispondente ad ogni release)
├── settings.json        hook PostToolUse condivisi (render artifact HTML)
├── agents/               agenti specializzati (.md, formato subagent Claude Code)
├── skills/               skill operative (SKILL.md + eventuali risorse)
├── comandi/              slash command (.md) — montati come ~/.claude/commands
├── scripts/              script di supporto (render, graph lint, offerta docx, prezzario)
├── schemas/              JSON Schema di manifest.json, _state/fasi.json, _state/run_log.json
├── mcp/prezzario/        server MCP di interrogazione prezzario (Sprint 2)
└── graph-schema.md       schema delle pagine nodo del knowledge graph
```

## Come una gara risolve la pipeline

La CLI Claude Code non offre oggi un flag per puntare la discovery di
`.claude/agents` `.claude/skills` `.claude/commands` e degli hook a un
percorso arbitrario mentre la working directory resta quella della
gara (verificato contro la documentazione corrente — vedi
`docs/sprint1-inventario.md`, sezione "Nodo critico"). Il meccanismo
usato:

```
$HOME/.claude/agents    → symlink → _pipeline/agents
$HOME/.claude/skills    → symlink → _pipeline/skills
$HOME/.claude/commands  → symlink → _pipeline/comandi
$HOME/.claude/scripts   → symlink → _pipeline/scripts
$HOME/.claude/settings.json → symlink → _pipeline/settings.json
```

creati da `scripts/setup/link_pipeline.sh` (idempotente, da rieseguire
solo se `_pipeline/` viene spostato — un `git pull` sui contenuti non
richiede nulla, perché il symlink punta sempre al working tree
corrente). Ogni invocazione headless:

```bash
cd /home/mike/spada/gare/<slug>
claude --setting-sources user -p "..."
```

usa la gara come working directory (letture/scritture dati) e lo scope
*user* (`~/.claude`, cioè `_pipeline/`) per agenti/skill/comandi/hook.
`--setting-sources user` esclude deliberatamente `project` e `local`:
una gara non ha né deve avere un proprio `.claude/`.

Il comando `spada-fase` (Sprint 3) è il wrapper che compone questa
invocazione, registra il run in `_state/run_log.json` prima di partire
e aggiorna `_state/fasi.json` / `_state/memoria.md` a fine fase.

## Versionamento

`VERSION` segue semver. Ogni release è taggata nel repo git
(`git tag v0.1.0`) cosi' che `_state/run_log.json` possa registrare
esattamente con quale versione è stata prodotta ogni proposta
(principio 4 del piano). Bump della versione ad ogni cambiamento
osservabile nel comportamento di un agente, skill o comando — non ad
ogni commit.

## Cosa manca ancora (prossimi sprint)

- `mcp/prezzario/`: server MCP di interrogazione (Sprint 2). Fino ad
  allora resta transitoriamente disponibile
  `scripts/prezzario/fetch_prezzario.sh` (cache JSON locale), da
  rimuovere quando il server MCP legge direttamente `spada.db`.
- `comandi/spada-fase`: wrapper di invocazione per fase, handoff,
  telemetria (Sprint 3).
