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

Un comando solo, dal download all'interrogabilità:

```bash
bash ../../scripts/setup/import_prezzario.sh Campania 2026
```

Scarica i due asset da `prometeus-prezzari` (serve `gh` autenticato: il
repo è privato), decomprime in una cartella temporanea, importa nello
**stesso** `spada.db` che usano backend e server MCP — risolto con
`SPADA_DB_PATH`, poi `SPADA_DATA_DIR`, poi `~/spada/_data` — e verifica
che le tabelle e l'indice full-text siano davvero popolati. I JSON
estratti (~50 MB) non restano sul disco.

Reimportare la stessa edizione la sostituisce: nessun duplicato.

Se serve il controllo manuale dei singoli passi:

```bash
bash setup.sh   # una tantum, crea .venv

.venv/bin/python3 import_prezzario.py \
  --db ../../../_data/spada.db \
  --regione Campania --anno 2026 \
  --articoli prezzario_campania_2026.json \
  --analisi prezzario_campania_analisi_2026.json
```

### Verifica su dato reale

L'edizione **Campania 2026** è stata scaricata e importata davvero, non
solo su fixture:

| | |
|---|---|
| Articoli | 31.755 |
| Voci con analisi | 16.178 |
| Sotto-gruppi validati | 37.830 — nessun mismatch |
| Voci elementari | 71.544 |
| Import | ~2,7 s |

La validazione bloccante dei subtotali **passa sul prezzario vero**: è
la conferma che mancava, perché fino a qui era stata provata solo su un
fixture sintetico. I quattro tool sono stati interrogati sul database
risultante: `versione_prezzario` restituisce fonte e riferimento
normativo (DGR n. 14 del 29/01/2026), `cerca_voce` trova 821 riscontri
per "calcestruzzo", `dettaglio_analisi` restituisce i sotto-gruppi come
lista ordinata (la stessa categoria compare più volte come fasi
distinte, che è il motivo per cui non vanno aggregati), e
`confronta_prezzo` classifica correttamente BASSO/MEDIO/ALTO a +3%,
+10% e +40%, mentre un codice assente torna `comparabile: false`.

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
