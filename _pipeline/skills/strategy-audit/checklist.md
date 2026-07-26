# Checklist — Strategy Audit

## Prima di iniziare
- [ ] Ho letto `02_graph/index.md`
- [ ] Ho letto `02_graph/economic_framework.md`
- [ ] Ho letto `manifest.json` (campo `prezzario`: regione/anno)
- [ ] Il knowledge graph e' stato costruito (index.md esiste)

## Analisi 1 — Budget sicurezza
- [ ] Ho letto `economic_framework.md`
- [ ] `oneri_sicurezza_eur` e `importo_lavori_eur` sono presenti o TBD documentato
- [ ] Percentuale calcolata (o NON DISPONIBILE motivato)
- [ ] Classificazione assegnata: CRITICO / BASSO / OK / NON DISPONIBILE
- [ ] Se CRITICO o BASSO: alert esplicito nella sezione
- [ ] Se fonti discordanti: contraddizione segnalata con entrambe le fonti

## Analisi 2 — Gap prezzi
- [ ] Ho cercato nodi elenco_prezzi / computo_metrico in index.md
- [ ] Ho chiamato `versione_prezzario(regione, anno)` (server MCP `prezzario`)
- [ ] Ho ricavato le categorie di lavorazione del computo con il loro peso
- [ ] Il campione tocca almeno una voce per ogni categoria >= 5% dell'importo
- [ ] Gap% calcolato per ogni voce del campione
- [ ] **Copertura per importo calcolata** (somma importi confrontati / importo lavori)
- [ ] **Gate di copertura applicato**: copertura >= 20% E tutte le categorie
      rilevanti coperte → altrimenti `NON RAPPRESENTATIVO`
- [ ] Tabella "Copertura per categoria" compilata, con ragione per ogni
      categoria non coperta
- [ ] Se NON RAPPRESENTATIVO: il gap e' etichettato con le sole categorie
      coperte, mai presentato come gap del progetto
- [ ] Se NON DISPONIBILE: istruzioni per aggiungere il prezzario incluse

## Analisi 3 — Viabilita' cantiere
- [ ] Ho cercato nodi relazione_generale e PSC in index.md
- [ ] Elementi viabilita' estratti dal testo (non inventati)
- [ ] Classificazione assegnata con motivazione basata su elementi specifici
- [ ] Se NON DETERMINABILE: motivazione esplicita

## Analisi 4 — Capacita' di investimento migliorativo
- [ ] Esito di Analisi 2 recuperato (classificazione, non solo il gap%)
- [ ] Se Analisi 2 e' NON DISPONIBILE o NON RAPPRESENTATIVO:
      classificazione NON CALCOLABILE e **nessun margine in euro scritto**
- [ ] Se calcolabile: `margine_eur = gap_medio% / 100 * importo_lavori_eur`
- [ ] Voci con maggiore e minore spazio elencate dalla tabella di Analisi 2
- [ ] Classificazione assegnata: AMPIO / MODERATO / LIMITATO / ASSENTE /
      NON CALCOLABILE

## Domande chiave
- [ ] Tra 4 e 6 domande generate
- [ ] Se Analisi 2 e' NON RAPPRESENTATIVO: la domanda sul completamento
      dell'estrazione e' presente (obbligatoria)
- [ ] Ogni domanda e' aperta (non retorica, non implica la risposta)
- [ ] Nessuna domanda suggerisce una strategia
- [ ] Almeno una domanda trasversale sulle priorita'

## Output
- [ ] `output/03_criteria/strategy_audit.md` creato con il template completo
- [ ] Riepilogo tabella alla fine del file
- [ ] Nessun valore inventato — tutti i dati hanno fonte citata
- [ ] Nessuna raccomandazione strategica nel testo
