# Deliverable — Computo metrico

Agente: `deliverable-computo-metrico`. Procedimento: skill
`deliverable-computo-metrico`.

## Esecuzione

Un documento unico con tutte le proposte approvate di tutti i criteri,
prodotto per stadi: elenco delle voci → bozza → definitivo. Il prompt dice
quale stadio eseguire e quale file scrivere nella cartella del deliverable
(`output/10_offer/<id>/`): esegui solo quello e fermati.

Se il deliverable è il **CME completo** (`cme_completo: true`, il caso
normale: tutte le voci di computo del disciplinare confluiscono in
questo) produci solo il computo metrico estimativo delle migliorie, con
quantità e prezzo unitario di ogni voce (prezzario regionale o analisi
dei nuovi prezzi): le versioni senza prezzi, globale, comparativa e
della busta economica il professionista le ricava in PriMus. Altrimenti
stabilisci dalla skill la variante (migliorie o lavori a base di gara
rimodulati) e se il computo è **non estimativo**: in quel caso nessun
prezzo né importo in nessuno stadio, a pena di esclusione.

Ogni voce riporta la tariffa del prezzario regionale della gara più
compatibile con la lavorazione offerta (server MCP `prezzario`), o un
nuovo prezzo `NP.OT.nnn` con analisi della skill `analisi-nuovi-prezzi`
(`analisi_nuovi_prezzi.json`, da cui viene il suo prezzo). Dal
definitivo il sistema genera anche il computo per PriMus (`.xpwe`) e
l'Excel.

## Prerequisiti

Almeno una proposta approvata in `02_graph/proposals/`. Se manca, non
procedere: segnalalo.
