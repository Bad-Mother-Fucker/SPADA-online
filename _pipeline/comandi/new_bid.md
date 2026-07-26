# Comando: /new_bid — Inizializza nuova gara

## Scopo
Completa i dati di gara in `manifest.json` estraendo dal disciplinare
quanto non è stato fornito alla creazione della gara.

## Cosa è già presente quando questo comando parte

Nel modello a pipeline condivisa la cartella di gara non è un clone:
è stata creata da `new_gara.sh` (Sprint 1.4), che ha già scritto
`manifest.json` con slug, nome esteso, regione e anno del prezzario,
modello ed effort — vedi schema in `_pipeline/schemas/manifest.schema.json`.
Non c'è nessun template da verificare e non c'è un clone da controllare:
il file da leggere e completare è semplicemente `manifest.json`, già
presente nella radice della gara.

## Prerequisiti
- Il disciplinare deve essere già presente in `input/disciplinare/`
- Gli elaborati devono essere già presenti in `input/elaborati/`
- `manifest.json` deve esistere (creato da `new_gara.sh`)

## Esecuzione

### Step A — Verifica struttura cartelle
```bash
ls input/disciplinare input/elaborati manifest.json
```
Se `manifest.json` manca, segnala l'anomalia e fermati: la gara non è
stata creata correttamente con `new_gara.sh`, non improvvisare un file
vuoto a mano.

`02_graph/` non esiste ancora a questo punto: viene creata e popolata
da `graph-builder` nella Fase 2. `vincoli_offerta_tecnica.md` (alla
radice della gara) va compilato dal professionista prima
dell'esecuzione di `offer-writer`.

### Step B — Estrai dati gara dal disciplinare
Usa `disciplinare-analyst` per leggere il disciplinare e estrarre:
- Nome completo della gara (oggetto del contratto) — solo se diverso
  dal nome esteso già in `manifest.json`, altrimenti conferma quello
- Stazione appaltante
- CIG
- CUP (se presente)
- Importo a base d'asta
- Scadenza presentazione offerte
- Elenco criteri con punteggi

Lo stesso agente produce `output/03_criteria/gara_brief.md` (e il suo
artifact HTML): è il documento da mandare al professionista subito,
prima ancora che gli elaborati siano indicizzati.

### Step C — Completa manifest.json
Aggiungi ai campi già presenti (slug, nome, regione/anno prezzario,
modello, effort) quelli estratti in Step B: stazione appaltante, CIG,
CUP, importo, scadenza, elenco criteri. Imposta
`fasi.acquisizione_documenti.stato = "completata"`.

Non richiedere di nuovo regione/anno del prezzario: sono già stati
decisi alla creazione della gara. Se il disciplinare li contraddice
(es. stazione appaltante di un'altra regione), segnalalo come
osservazione — non sovrascrivere silenziosamente un dato di manifest
già impostato dall'operatore.

### Step D — Mostra riepilogo
```
Gara inizializzata: [slug]

Dati estratti dal disciplinare:
- Nome: [nome]
- Stazione appaltante: [sa]
- CIG: [cig]
- CUP: [cup]
- Importo: [importo]
- Scadenza: [scadenza]

Criteri individuati:
- C1 — [titolo] ([punti] pt)
- C2 — [titolo] ([punti] pt)
...

Prezzario in uso: [regione] [anno] (impostato alla creazione della gara)
```

Non è previsto uno STOP di conferma interattivo qui: questo comando
gira come invocazione a sé stante (`spada-fase <slug> 1`, Sprint 3),
non in una sessione interattiva. Eventuali correzioni ai dati estratti
si fanno rieseguendo la fase dopo aver corretto `manifest.json` o il
disciplinare stesso.
