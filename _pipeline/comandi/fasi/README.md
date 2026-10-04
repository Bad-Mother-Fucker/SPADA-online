# Fasi discrete

Otto fasi, ciascuna invocabile a sé con `spada-fase <slug> <n>` (vedi
`_pipeline/scripts/setup/spada_fase.sh`). Ogni file qui dentro è il
prompt che `spada-fase` passa a `claude -p` per quella fase — non un
comando invocato dall'utente interattivamente come quelli in
`_pipeline/comandi/` (che restano i building block: `/analyze_disciplinare`,
`graph-builder`, ecc. — questi template li richiamano).

| Fase | Chiave in `_state/fasi.json` | Cosa fa | Intervento umano |
|---|---|---|---|
| 1 | `1_acquisizione_documenti` | censimento ed estrazione, analisi del disciplinare, prima stesura del brief, domande dal disciplinare | — |
| 2 | `2_costruzione_grafo` | analisi degli elaborati nel grafo, brief aggiornato, domande dagli elaborati | — |
| 3 | `3_analisi_strategica` | audit strategico, brief aggiornato, domande strategiche | — |
| 4 | `4_domande_professionista` | invio di risposte e indicazioni: entrano in memoria, grafo e brief | **gate**: si esegue quando il professionista ha risposto |
| 5 | `5_elaborazione_criteri` | ricerca soluzioni: gap, proposte, audit per criterio | — |
| 6 | `6_revisione_proposte` | decisioni sulle proposte | checkpoint senza agente (`--approva`) |
| 7 | `7_stesura_offerta` | deliverables (un job per deliverable) | — |
| 8 | `8_approvazione_finale` | audit di consegna | checkpoint senza agente (`--approva`) |

## Contratto comune a ogni fase con agente (1, 2, 3, 4, 5, 7)

1. Carica `_state/memoria.md` (digest cumulativo) e l'handoff della fase
   precedente (`_state/handoff/<n-1>_*.json`) — mai l'intero workspace.
2. Esegue il lavoro descritto nel proprio template.
3. **Scrive `_state/handoff/<n>_<nome_fase>.json`**, schema in
   `_pipeline/schemas/handoff.schema.json`. Solo riferimenti
   verificabili (file/nodi esistenti) — mai un riassunto non ancorato.
4. **Aggiorna `_state/memoria.md`**: aggiunge (non sostituisce) un
   paragrafo breve in linguaggio naturale su questa fase.
5. Se l'handoff manca a fine esecuzione, `spada-fase` registra l'esito
   `errore` in `run_log.json` anche se il resto della fase è andato a
   buon fine: un handoff mancante rompe la catena per la fase successiva.

## Il gara brief: un documento vivo a sezioni fisse

`output/03_criteria/gara_brief.md` nasce in Fase 1 (disciplinare-analyst)
con le informazioni minime e si aggiorna a fine Fase 2, 3 e 4 e a ogni
integrazione (`brief-writer`). Le sezioni sono sempre quelle del
template `_pipeline/templates/gara_brief_template.md`; il commento in
testa al template dice quale fase popola quale sezione.

## Le domande: un registro unico, un solo gate

Le domande al professionista non stanno nel brief né nell'audit
strategico. Le Fasi 1, 2 e 3 (e le integrazioni) le registrano in
`output/07_questions/domande.json` con
`_pipeline/scripts/domande/domande.py`; il professionista risponde
dall'interfaccia (bozza salvata, esportabile, ripresa in sessioni
diverse) e aggiunge le indicazioni strategiche. Le risposte entrano nel
contesto solo quando esegue la Fase 4: `domande.py consolida` scrive il
digest e la memoria, `answers-integrator` aggiorna il grafo,
`brief-writer` il brief, e `domande.py handoff` mette indicazioni e
risposte nelle decisioni che la Fase 5 riceve.

## Integrazioni fuori fase

Un documento caricato dopo la Fase 2 non richiede di rieseguire le fasi:
`spada_integra.sh <slug> documento <percorso>` lo estrae, lo aggiunge al
grafo (nuovo documento o nuova versione), aggiorna il brief e registra
eventuali domande nuove. `spada_integra.sh <slug> brief` riallinea il
brief al template corrente con quanto prodotto dalle fasi già eseguite.
Istruzioni in `_pipeline/comandi/integrazioni/`.

## Dipendenze tra fasi (lineari)

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
```

Ogni fase carica l'handoff della sola fase immediatamente precedente.
La Fase 7 legge in più, per nome, l'handoff della Fase 4 (priorità del
professionista).
