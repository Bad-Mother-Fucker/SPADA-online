# Server MCP `prezzario` (Sprint 2)

Sostituisce integralmente la skill `prezzario` a indice JSON di
`_riferimento/`: il prezzario regionale è dato interrogabile in
`spada.db` (SQLite + FTS5), mai caricato per intero in un prompt.

## Perché non più JSON in cache locale

Il modello precedente (`fetch_prezzario.sh`) scaricava due file JSON
per regione/anno in una cache locale, letti poi con `jq`/Python
dall'agente. Funzionava, ma: (a) l'intero file restava disponibile per
essere caricato per errore in contesto, (b) ogni gara doveva
ri-verificare presenza/percorso della cache, (c) nessuna validazione
strutturale dei subtotali dell'Analisi avveniva all'importazione — un
Excel mal esportato produceva un JSON silenziosamente sbagliato.

Qui l'importazione (`import_prezzario.py`) è l'unico punto in cui i
due JSON sorgente vengono letti per intero, e **fallisce bloccando
tutto** se un subtotale non torna (vedi sotto). Da quel momento in poi
si interroga solo via server MCP.

## File

```
schema.sql              schema SQLite (FTS5 su voce+articolo, tabelle
                         normalizzate e ORDINATE per l'Analisi)
import_prezzario.py      importatore con validazione bloccante
server.py                server MCP (FastMCP): cerca_voce, dettaglio_analisi,
                         confronta_prezzo, versione_prezzario
setup.sh                 crea il venv (mcp, in requirements.txt)
run.sh                   avvia il server nel venv (usato da `claude mcp add`)
requirements.txt
```

Il database vive in `_data/spada.db` (fuori da `_pipeline/`, non
versionato — coerente con la struttura target del piano: `_data/` è
per-macchina, non per-gara e non parte del codice pipeline).

## Validazione bloccante in importazione

Nel file Analisi, `componenti` è una **lista ordinata**, non un
dizionario per categoria: la stessa categoria (es. `ATTREZZATURE`) può
comparire più volte come sotto-gruppi indipendenti di fasi distinte
della stessa voce composita. Un parser a dizionario aggregherebbe
silenziosamente questi sotto-gruppi sotto un unico totale sbagliato.

`import_prezzario.py` ricalcola la somma degli `importo` di ogni
sotto-gruppo e la confronta col `totale` dichiarato (tolleranza: max
tra 0,02 € assoluti e 0,1% relativo, per arrotondamenti Excel→JSON). Al
primo mismatch: **nessuna riga viene scritta**, l'importazione esce
con codice diverso da zero e un messaggio che identifica voce,
sotto-gruppo, valore dichiarato e valore calcolato. Verificato con un
test negativo deliberato (subtotale corrotto → importazione bloccata,
nessun file `.db` scritto).

## Importare un'edizione

```bash
./setup.sh   # una tantum, crea .venv

.venv/bin/python3 import_prezzario.py \
  --db ../../../_data/spada.db \
  --regione Campania --anno 2026 \
  --articoli prezzario_campania_2026.json \
  --analisi prezzario_campania_analisi_2026.json
```

I due JSON sorgente si ottengono da `prometeus-prezzari`
(`gh release download <regione>-<anno> --repo Bad-Mother-Fucker/prometeus-prezzari`,
poi `gunzip`) — stesso contratto già usato da `fetch_prezzario.sh`,
solo che ora l'output va importato invece che messo in cache.

**Nota**: l'edizione `campania-2026` esiste come release in
`prometeus-prezzari` ma non è stata scaricata e importata in questo
sprint — l'ambiente di sviluppo in cui è stato costruito questo server
non ha accesso diretto agli asset di release di un repo privato (il
download autenticato via `curl`/token è bloccato dal sandbox; serve
`gh` CLI o l'accesso diretto sulla VM). L'importatore e il server sono
stati validati con un fixture sintetico ma fedele allo schema
(`/tmp/fixture_*.json` nella sessione di sviluppo, non incluso nel
repo): validazione positiva, validazione negativa (subtotale
corrotto → blocco), e non interferenza tra due annualità diverse nello
stesso `spada.db`. **Il primo import reale di Campania 2026 va fatto
sulla VM con `gh` disponibile**, prima di considerare Sprint 2 chiuso
end-to-end.

## Registrazione

`scripts/setup/link_pipeline.sh` registra il server automaticamente
(`claude mcp add --transport stdio prezzario --scope user`), così è
disponibile a ogni gara senza configurazione per-gara. Verifica con
`claude mcp list`.

## Soglie di scostamento (`confronta_prezzo`)

Identiche al price-gap check di `strategy-auditor` in `_riferimento/`:

| Scostamento assoluto | Categoria |
|---|---|
| ≤ 5% | BASSO |
| 5%–15% | MEDIO |
| > 15% | ALTO |

Un codice tariffa assente dal prezzario (voce a corpo, prezzo custom)
o con `prezzo` nullo per contratto (voci MATERIALI/MANODOPERA prive di
prezzo pubblicato) restituisce `comparabile: false` — mai forzato a un
match approssimativo.
