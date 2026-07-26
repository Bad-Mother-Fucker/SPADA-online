# Checklist — Graph Lint

## Check 1 — Orfani
- [ ] Ho elencato tutte le pagine in `02_graph/nodes/`
- [ ] Ho verificato che ogni pagina abbia `supports_criteria` non vuoto
- [ ] Per ogni orfano trovato: ho valutato se e' giustificato
- [ ] Ho aggiornato la sezione "Orfani" in `index.md`

## Check 2 — Contraddizioni dati economici
- [ ] Ho confrontato `oneri_sicurezza` in `economic_framework.md` vs
      pagina nodo stima sicurezza
- [ ] Ho confrontato `importo_lavori` vs somma categorie (se disponibili)
- [ ] Le contraddizioni trovate sono segnalate con entrambi i valori e fonti

## Check 3 — Archi doc->doc mancanti sospetti
- [ ] Ogni sezione con tavole ha almeno un arco tavola<->relazione
- [ ] Ogni `subtype: computo_metrico` ha almeno un arco verso una relazione

## Check 4 — Versioni multiple
- [ ] Per ogni `version_group`: esattamente un `is_latest: true`
- [ ] Archi `versione_precedente` / `versione_successiva` presenti

## Check 5 — Pagine speciali
- [ ] `02_graph/scope.md` esiste
- [ ] `02_graph/economic_framework.md` esiste
- [ ] Almeno alcuni campi non sono TBD (se tutti TBD: segnala)

## Output
- [ ] `02_graph/index.md` sezione orfani aggiornata
- [ ] Entry appesa a `02_graph/log.md` con il formato corretto
- [ ] Report stampato nel contesto con categorie ERRORE/ALERT/ATTENZIONE/OK
