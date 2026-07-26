# Fasi discrete (Sprint 3)

Sette fasi, ciascuna invocabile a sé con `spada-fase <slug> <n>` (vedi
`_pipeline/scripts/setup/spada_fase.sh`). Ogni file qui dentro è il
prompt che `spada-fase` passa a `claude -p` per quella fase — non un
comando invocato dall'utente interattivamente come quelli in
`_pipeline/comandi/` (che restano i building block: `/analyze_disciplinare`,
`graph-builder`, ecc. — questi template li richiamano).

## Contratto comune a ogni fase con agente (1, 2, 3, 4, 6)

1. Carica `_state/memoria.md` (digest cumulativo) e gli handoff delle
   fasi da cui dipende (`_state/handoff/<n>_*.json`) — mai l'intero
   workspace.
2. Esegue il lavoro descritto nel proprio template.
3. **Scrive `_state/handoff/<n>_<nome_fase>.json`**, schema in
   `_pipeline/schemas/handoff.schema.json`. Solo riferimenti
   verificabili (file/nodi esistenti) — mai un riassunto non ancorato.
4. **Aggiorna `_state/memoria.md`**: aggiunge (non sostituisce) un
   paragrafo breve in linguaggio naturale su questa fase.
5. Se l'handoff o l'aggiornamento di memoria.md mancano a fine
   esecuzione, `spada-fase` lo segnala come esito `errore` in
   `run_log.json` anche se il resto della fase è andato a buon fine:
   un handoff mancante rompe la catena per la fase successiva.

## Fasi 3, 5, 7 — intervento umano

- **Fase 3** (analisi strategica): l'agente produce
  `output/03_criteria/strategy_audit.md`, ma la fase resta
  `richiede_approvazione: true` finché il professionista non compila
  "Indicazioni strategiche del professionista" — vedi
  `3_analisi_strategica.md`.
- **Fase 5** (revisione proposte): nessun agente. `spada-fase 5` non
  invoca `claude -p`: riporta lo stato delle proposte in attesa
  (`output/06_registers/proposal_register.md`) e resta
  `richiede_approvazione: true` finché non arrivano le decisioni
  (Sprint 4: `POST /gare/{slug}/approvazioni`; nel frattempo via
  `/process_feedback` come nel modello precedente).
- **Fase 7** (approvazione finale): idem, sull'offerta in `output/10_offer/`.

## Dipendenze tra fasi (lineari, Sprint 3)

```
1 → 2 → 3 → 4 → 5 → 6 → 7
```

Ogni fase carica l'handoff della sola fase immediatamente precedente.
Se in futuro una fase avrà bisogno dell'handoff di una fase non
immediatamente precedente, aggiungere qui la dipendenza esplicita
invece di far rileggere tutto.
