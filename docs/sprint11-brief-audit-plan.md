# Sprint 11 — Gara Brief nello stepper + Audit strategico riconoscibile in Fase 3

Nasce da due lacune segnalate dopo l'incidente di produzione sull'upload
(vedi `sprint9-notes.md`): il Gara Brief esiste ma è sepolto in una vista
trasversale minore; l'Audit strategico esiste — è la Fase 3 — ma è
irriconoscibile sotto il nome "Analisi capitolato" e il rendering
generico non riflette la sua struttura reale.

Verificato leggendo il codice, non per supposizione:
`_pipeline/comandi/fasi/1_acquisizione_documenti.md` (chi scrive
`gara_brief.md` e quando), `_pipeline/comandi/fasi/3_analisi_strategica.md`
(il gate umano mai esposto in UI), `_pipeline/agents/strategy-auditor.md`
+ `_pipeline/skills/strategy-audit/SKILL.md` (struttura esatta del
documento), `app/frontend/js/{dominio,gara,viste}.js` (stato attuale).

Non serve alcun tool di design esterno per questo lavoro: entrambe le
feature compongono componenti e token già esistenti in
`css/tokens.css`/`app.css` (stessa cosa fatta nel mockup di confronto
per il punto 1). Se per "MCP di Claude design" intendevi il progetto
Canva/Design citato in `app/frontend/README.md` («Design system e
pagina gara», da cui `tokens.css` è stato copiato) e vuoi che una nuova
variante visiva nasca lì prima di arrivare nel codice, fammelo sapere
esplicitamente — per ora questo piano assume di estendere `app.css`
direttamente, com'è stato fatto finora per ogni altro componente.

---

## Feature 1 — Gara Brief come card nello stepper

Card non numerata, primo posto nella riga dello stepper, stesso
componente visivo (`.step`) delle 7 fasi. **Bloccata** finché
`03_criteria/gara_brief.md` non compare in `GET /gare/{slug}/output` —
prodotto da `disciplinare-analyst` a fine Fase 1, confermato in
`_pipeline/comandi/fasi/1_acquisizione_documenti.md` riga 13. Prima di
allora: card visibile, non cliccabile, aspetto disattivato, tooltip
"Disponibile a fine Fase 1 (Acquisizione documenti)". Sbloccata: click
→ `#/brief` (vista già esistente, `Viste.brief()` non cambia).

### Dove

- `app/frontend/js/gara.js` → `disegnaStepper()` (riga 688): prependere
  l'elemento brief al `.map()` su `Dominio.FASI`. Stato di sblocco da
  `stato.output.includes("03_criteria/gara_brief.md")` — lo stesso dato
  già letto da `Viste.brief()` per `haMd`, nessuna nuova fetch.
- `app/frontend/css/app.css` → `.stepper ol` da
  `grid-template-columns: repeat(7, minmax(126px, 1fr))` a 8 colonne
  (valutare colonna fissa più stretta per il brief + `repeat(7, 1fr)`
  per le fasi, per non comprimere troppo le 7 esistenti — vedi il
  mockup già pubblicato per la proporzione usata lì: `0.85fr` +
  `repeat(7, 1fr)`). Nuove varianti: `.step--brief` (accento invece
  del colore di stato) e `.step[data-locked="true"]` (opacità ridotta,
  `cursor: default`, nessun hover, `aria-disabled="true"`).

### Dati

Nessuno nuovo. Nessuna modifica backend.

### Rischio

Basso — un componente esteso, una fetch già esistente riusata.

---

## Feature 2 — Fase 3 riflette davvero l'audit strategico

### 2.1 — Naming

`dominio.js → FASI[2]` oggi: titolo "Analisi capitolato", kicker "Fase
3 · analisi", sottotitolo generico sul capitolato. Nessuno dei tre nomina
budget/prezzi/viabilità/investimento. Propongo di allinearlo al nome
reale del contenuto (es. titolo "Audit strategico", kicker "Fase 3 ·
audit strategico"). **Da confermare con te**: è un cambio visibile,
non solo tecnico — testo esatto a tua scelta.

### 2.2 — Rendering strutturato (sostituisce il parser euristico)

Oggi `gara.js::parseAnalisi()` (righe 386-409) legge sezioni H2
genericamente e indovina una severità da parole chiave ("critic",
"conflitt", ...). Non conosce le 4 analisi nominate né le loro
classificazioni reali. La struttura vera, da
`_pipeline/skills/strategy-audit/SKILL.md` righe 554-629
(`strategy_audit.md` è generato esattamente così):

```
## 1. Budget sicurezza                    → Classificazione: CRITICO/BASSO/OK/N.D.
## 2. Analisi prezzi — gap rispetto...     → Classificazione: BASSO/MEDIO/ALTO/NON RAPPRESENTATIVO/N.D.
## 3. Posizione e viabilita' cantiere      → Classificazione: FAV/NEUTRO/SFAV/N.D.
## 4. Capacita' di investimento migl.      → Classificazione: AMPIO/MODERATO/LIMITATO/ASSENTE/N.C.
## Domande chiave per il professionista    → lista numerata
## Riepilogo                               → tabella Analisi|Classificazione|Alert
## Indicazioni strategiche del professionista
### Risposte alle domande chiave
### Direttive operative                    → Tono generale, Priorita' per criterio,
                                              Vincoli specifici, Opportunita', Note
```

Coerente con la preferenza già dichiarata nel progetto ("dove il
backend espone un endpoint strutturato la vista usa quello",
`app/frontend/README.md`), propongo un endpoint dedicato invece di
continuare ad affidarsi al parsing client-side di un markdown libero:

**`GET /gare/{slug}/audit-strategico`** — parsa `strategy_audit.md`
server-side sulle 7 sezioni sopra, ritorna JSON:
`{generato_il, analisi: [{n, titolo, classificazione, alert, corpo}],
riepilogo: [{analisi, classificazione, alert}], domande_chiave: [...],
indicazioni: {risposte: [...], tono, priorita_per_criterio: {},
vincoli: [...], opportunita: [...], note} | null}`.
`indicazioni: null` finché non compilata (segnaposto ancora presenti —
stessa verifica euristica già descritta in
`3_analisi_strategica.md`: "la sezione non contiene più i segnaposto
vuoti del template").

Frontend: `viste.js` → nuovo `fase3()` che rende 4 card di analisi
(titolo + badge di classificazione con lo stesso vocabolario semantico
già in uso altrove — crit/warn/ok/info, non un nuovo set di colori),
la tabella di riepilogo, le domande chiave.

### 2.3 — Il checkpoint umano mancante

`_pipeline/comandi/fasi/3_analisi_strategica.md` è esplicito: la fase
**non risulta completata** finché "Indicazioni strategiche del
professionista" non è compilata — oggi possibile solo editando il file
a mano, la "UI (Sprint 6)" che il comando cita non è mai stata
costruita. È il gate mancante più importante dei tre.

**`POST /gare/{slug}/audit-strategico/indicazioni`** — body:
```json
{
  "risposte": ["...", "..."],
  "tono": "conservativo|bilanciato|audace",
  "priorita_per_criterio": {"C1": "...", "C2": "..."},
  "vincoli": ["..."],
  "opportunita": ["..."],
  "note": "..."
}
```
Scrive nella sola sezione `## Indicazioni strategiche del
professionista` (Edit mirato, non riscrittura del resto del file — stessa
regola di `feedback-processor` sui `Cx_output.md`). Una volta scritta
senza segnaposto vuoti, la fase può passare a `completata` (stessa
euristica del comando di fase, applicata qui invece che dentro una
sessione Claude Code).

Frontend: form in `fase3()` — un campo per domanda chiave (numero
variabile, 4-6), select per il tono, un campo per criterio attivo
(elenco criteri attivo da verificare: stessa fonte già usata dalla
Fase 2/checklist criteri, da confermare il percorso esatto in fase di
implementazione), liste libere per vincoli/opportunità, textarea note.

### Rischio

Medio. Un endpoint nuovo di lettura, uno di scrittura, un parser
server-side su un formato che va rispettato esattamente (non è
negoziabile: se `strategy-auditor` cambia leggermente la forma del
template, il parser va aggiornato in coppia — stesso principio già
seguito da `md.js` per gli altri registri, "cerca per sinonimi, non per
posizione", da applicare anche qui dove ha senso).

---

## Ordine di esecuzione consigliato

1. Feature 1 — basso rischio, sblocca subito la richiesta "pari rango".
2. Feature 2.2 — endpoint di lettura + rendering (sola lettura prima
   del form, verificabile su una gara reale prima di aggiungere la
   scrittura).
3. Feature 2.3 — endpoint di scrittura + form, con la verifica del
   gate "fase completata".
4. Deploy manuale sulla VM (stesso schema dei fix precedenti) e verifica
   end-to-end su `riqualiicazione-castello-di-fondi`.

## Decisioni che servono da te prima di partire

1. Testo esatto per titolo/kicker/sottotitolo della Fase 3 (2.1).
2. Form delle indicazioni strategiche: campi separati come sopra, o un
   unico campo libero più semplice da costruire ma meno guidato?
3. Conferma per procedere nell'ordine 1→4, o priorità diversa.
