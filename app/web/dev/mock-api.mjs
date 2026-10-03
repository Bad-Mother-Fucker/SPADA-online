#!/usr/bin/env node
// Backend finto per esercitare gli stati dell'interfaccia senza toccare
// quello vero. Nessuna dipendenza. Copre elenco gare e pagina gara: otto
// fasi, registri markdown, documenti, deliverable, grafo, domande, stream.
//
//   node dev/mock-api.mjs            # porta 8765
//   SPADA_API_URL=http://127.0.0.1:8765 npx vite --port 5174
//
// Scenari, cambiabili a caldo con GET /_scenario/<nome>:
//   normale   cinque gare con stati diversi, prezzari installati
//   vuoto     nessuna gara
//   errore    ogni richiesta risponde 503
//   lento     ogni risposta arriva dopo 4 secondi
//   timeout   le richieste non rispondono mai
//   rete      la connessione viene chiusa senza risposta
//   senza-prezzari   come normale, ma nessun prezzario installato

import http from "node:http"

const PORTA = Number(process.env.PORTA || 8765)
let scenario = process.env.SCENARIO || "normale"

const ora = Date.now()
const iso = (minutiFa) => new Date(ora - minutiFa * 60_000).toISOString()
const giorni = (n) => new Date(ora + n * 86_400_000).toISOString().slice(0, 10)
const CHIAVI = ["1_acquisizione_documenti", "2_costruzione_grafo", "3_analisi_strategica", "4_domande_professionista", "5_elaborazione_criteri", "6_revisione_proposte", "7_stesura_offerta", "8_approvazione_finale"]

const fasi = (stati, sintesi = {}) => {
  const out = {}
  CHIAVI.forEach((k, i) => {
    const s = stati[i] || "da_eseguire"
    out[k] = s === "da_rivedere"
      ? { stato: "completata", richiede_approvazione: true, iniziata_il: iso(60 * 24 * 2 + 40), conclusa_il: iso(60 * 24 * 2 + 18), sintesi: sintesi[i + 1] }
      : { stato: s, iniziata_il: s === "da_eseguire" ? null : iso(30 * (9 - i)), conclusa_il: s === "completata" ? iso(20 * (9 - i)) : null, sintesi: sintesi[i + 1] }
  })
  return out
}

// ----------------------------------------------------------------- fixture

const CRITERIA_MATRIX = `# Matrice dei criteri

**Fonte:** disciplinare di gara, par. 18.2, pagg. 29-31

| ID | Criterio | Punteggio max | Subcriteri | Metodo attribuzione | Note |
|---|---|---|---|---|---|
| C1 | Involucro, infissi ed efficientamento acustico | 25 | C1.1, C1.2, C1.3 | Discrezionale | riparametrazione per sub-criterio |
| C2 | Energie rinnovabili e sistemi di sicurezza | 30 | C2.1, C2.2, C2.3 | Discrezionale | BIPV con parere Soprintendenza |
| C3 | Logistica di cantiere e dotazioni | 15 | C3.1, C3.2 | Discrezionale | |
| C4 | Accessibilità universale e criteri CAM | 10 | C4.1 | Discrezionale | |
| C5 | Riduzione del tempo di esecuzione | 5 | | Tabellare | max 30 giorni |
| C6 | Estensione della garanzia | 3 | | Tabellare | |
| C7 | Certificazioni dell'impresa | 2 | | Tabellare | ISO 14001, SA 8000 |
| | Totale | 90 | | | |
`

const STRATEGY_AUDIT = `# Audit strategico — Servizio di manutenzione degli impianti elevatori

**Stato analisi:** completata

> **ATTENZIONE** L'analisi usa il prezzario Campania 2026. Le voci non trovate sono segnalate come TBD nel computo.

## Budget sicurezza

**Classificazione:** ✅ ADEGUATO

Gli oneri della sicurezza non soggetti a ribasso valgono **48.200 euro**, il 3,1 % dell'importo lavori. In linea con interventi analoghi su impianti in esercizio.

| Voce | Importo | Incidenza |
|---|---|---|
| Oneri sicurezza | 48.200 € | 3,1 % |
| Importo lavori | 1.554.000 € | 96,9 % |

## Gap prezzi rispetto al prezzario

**Classificazione:** ⚠️ LIMITATO

Il computo usa 212 voci, di cui 14 non presenti nel prezzario regionale. Le voci nuove riguardano gli argani gearless e i quadri di manovra.

- E.14.20 argano gearless 630 kg: nel computo 9.800 €, voce analoga di prezzario 11.450 €
- E.22.08 quadro di manovra VVVF: nel computo 3.200 €, nessuna voce di prezzario

## Viabilità del cantiere

**Classificazione:** 🔴 CRITICO

Tre dei nove impianti sono l'unico accesso ai reparti di degenza: ogni fermo oltre le 4 ore richiede un piano alternativo con la direzione sanitaria.

## Capacità di investimento migliorativo

**Classificazione:** ✅ AMPIO

Il margine stimato fra base d'asta e costi industriali è del 14 %: consente migliorie fino a circa 90.000 euro senza erodere l'utile atteso.

## Riepilogo

Puntare su C2 e C1, dove il margine c'è e i sub-criteri pesano di più. Il rischio vero è la viabilità: va trattato in C3 con un piano turni documentato.
`

const GARA_BRIEF = `# Gara brief — Servizio di manutenzione degli impianti elevatori

## Dati essenziali

> **Aggiornata:** Fase 1 · 02/10/2026 · disciplinare-analyst

**Stazione appaltante:** ASL Napoli 3 Sud
**CIG:** B2F1A9C0E7
**Importo a base d'asta:** 1.602.200 euro
**Scadenza offerta:** 17/10/2026 ore 12:00
**Criterio:** offerta economicamente più vantaggiosa, 90 punti tecnici e 10 economici

## Cosa chiede la gara

> **Aggiornata:** Fase 2 · 03/10/2026 · brief-writer

Manutenzione full risk di nove impianti elevatori in esercizio presso tre presidi ospedalieri, con reperibilità 24 ore e tempo di intervento entro 90 minuti. Gli elaborati di progetto descrivono due sostituzioni integrali e sette ammodernamenti.

## Criteri di valutazione

> **Aggiornata:** Fase 1 · 02/10/2026 · disciplinare-analyst

| Criterio | Punti | Metodo |
|---|---|---|
| C1 Involucro, infissi, acustica | 25 | discrezionale |
| C2 Energie rinnovabili e sicurezza | 30 | discrezionale |
| C3 Logistica di cantiere | 15 | discrezionale |
| C4 Accessibilità e CAM | 10 | discrezionale |
| C5, C6, C7 tabellari | 10 | tabellare |

## Punti di attenzione

> **Aggiornata:** Fase 3 · 03/10/2026 · brief-writer

- Soglia di sbarramento a 50/90, calcolata prima della riparametrazione.
- La tavola PI-00a-ESEC-01 richiamata dal disciplinare manca fra i documenti di gara.
- Due discordanze fra computo e relazione tecnica sul fattore solare dei vetri.

## Risposte del professionista

> **Da completare:** in Fase 4, quando invii risposte e indicazioni.

## Storico aggiornamenti

| Quando | Fase | Cosa |
|---|---|---|
| 02/10/2026 | 1 | prima stesura dal disciplinare |
| 03/10/2026 | 2 | elaborati letti e collegati ai criteri |
| 03/10/2026 | 3 | punti di attenzione dall'audit |
`

const GAP_REGISTER = `# Registro dei gap

| ID | Criterio | Titolo | Severità | Sintesi | Proposta | Prova |
|---|---|---|---|---|---|---|
| G-C2-001 | C2.1 | Nessuna referenza su fotovoltaico integrato in edifici vincolati | Alta | Il sub-criterio premia il BIPV con parere della Soprintendenza; l'impresa ha solo impianti su copertura | P-C2-001 | Elenco lavori 2021-2025, pag. 4: nessun BIPV |
| G-C2-002 | C2.3 | Accumulo dichiarato inferiore alla soglia | Media | Il bando chiede oltre 20 kWh, la relazione ne dichiara 15 | P-C2-002 | Relazione tecnica RS-01, par. 6.2 |
| G-C1-001 | C1.1 | Prestazioni termiche degli infissi non documentate | Media | Mancano le schede Uw dei serramenti proposti | | Capitolato, art. 42 |
| G-C3-001 | C3.1 | Piano turni per i presidi con accesso unico | Alta | Tre impianti sono l'unico accesso ai reparti: serve un piano con la direzione sanitaria | P-C3-001 | Disciplinare, par. 12.4 |
`

const PROPOSAL_REGISTER = `# Registro delle proposte

| ID | Titolo | Criterio | Gap | Stato | Sintesi | Severità | Punti |
|---|---|---|---|---|---|---|---|
| P-C2-001 | Manutenzione predittiva con sensori di vibrazione sugli argani | C2 | G-C2-001 | in attesa | Copre il gap sui fermi macchina con una prova documentale del 2024 | Alta | 12 |
| P-C2-002 | Accumulo da 24 kWh con batterie LFP e BMS certificato | C2 | G-C2-002 | approvata | Porta l'accumulo sopra la soglia del bando | Media | 6 |
| P-C3-001 | Reperibilità 24 ore con presidio a Pomigliano e secondo turno | C3 | G-C3-001 | in attesa | Tempo di intervento entro 60 minuti documentato con il registro 2025 | Alta | 8 |
| P-C4-001 | Piano di formazione del personale sui nuovi quadri di manovra | C4 | | in attesa | Proposta migliorativa senza gap associato | Bassa | 3 |
`

const AUDIT_SUMMARY = `# Audit di consegna

| Voce | Esito | Dettaglio |
|---|---|---|
| Relazione tecnica entro 40 facciate | conforme | 36 facciate, formato A4 |
| Computo metrico firmato digitalmente | conforme | firma P7M verificata |
| Cronoprogramma in formato Gantt | incompleto | manca la legenda delle lavorazioni notturne |
| Dichiarazione CAM | mancante | da allegare il modulo DGUE sezione C |
| Marca da bollo sull'offerta economica | fuori perimetro | si appone in fase di invio |
`

const RELAZIONE = `# Relazione tecnica

## Premessa

L'offerta risponde ai sette criteri del disciplinare con un approccio di manutenzione predittiva e di continuità di servizio.

## C1 Involucro, infissi ed efficientamento acustico

Si propongono serramenti con trasmittanza Uw di 1,1 W/m²K e vetri acustici da 38 dB, con schede tecniche allegate.

## C2 Energie rinnovabili e sistemi di sicurezza

Impianto fotovoltaico integrato da 48 kWp con accumulo da 24 kWh e sistema antintrusione con TVCC su tutti gli accessi.

## C3 Logistica di cantiere

Piano turni concordato con la direzione sanitaria, con presidio a Pomigliano e secondo turno notturno.
`

const DOMANDE = {
  versione: 1,
  domande: [
    { id: "D-001", origine: "fase_1", categoria: "amministrativa", criterio: null, testo: "Il sopralluogo è obbligatorio entro il 10/10: chi lo esegue per l'impresa?", perche: "La mancata attestazione è causa di esclusione.", fonte: "disciplinare, par. 11", stato: "aperta", superata_da: null, motivo_superata: "", creata_il: iso(60 * 48), risposta: "Lo esegue il direttore tecnico Rossi il 7/10.", risposta_il: iso(60 * 30), inviata_il: null },
    { id: "D-002", origine: "fase_1", categoria: "quesito_sa", criterio: "C2", testo: "Il BIPV su edificio vincolato richiede parere preventivo della Soprintendenza: chiederlo in sede di chiarimenti?", perche: "Il termine per i quesiti scade il 06/10.", fonte: "disciplinare, par. 18.4", stato: "aperta", superata_da: null, motivo_superata: "", creata_il: iso(60 * 48), risposta: "", risposta_il: null, inviata_il: null },
    { id: "D-003", origine: "fase_2", categoria: "tecnica", criterio: "C1", testo: "Il fattore solare dei vetri è 0,50-0,60 nel computo e 0,35 nella relazione: quale vale?", perche: "Incide sul calcolo del punteggio di C1.1.", fonte: "G-02, G-09", stato: "aperta", superata_da: null, motivo_superata: "", creata_il: iso(60 * 36), risposta: "", risposta_il: null, inviata_il: null },
    { id: "D-004", origine: "fase_3", categoria: "strategica", criterio: null, testo: "Quanto si può investire in migliorie oltre il margine stimato del 14 %?", perche: "Determina l'ambizione delle proposte su C2.", fonte: "strategy_audit.md", stato: "aperta", superata_da: null, motivo_superata: "", creata_il: iso(60 * 20), risposta: "", risposta_il: null, inviata_il: null },
    { id: "D-005", origine: "professionista", categoria: "informazione", criterio: "C2", testo: "Budget per le migliorie: l'impresa può investire fino a 25.000 euro, con priorità al fotovoltaico.", perche: "", fonte: "", stato: "aperta", superata_da: null, motivo_superata: "", creata_il: iso(60 * 10), risposta: "L'impresa può investire fino a 25.000 euro in migliorie, con priorità al fotovoltaico.", risposta_il: iso(60 * 10), inviata_il: null },
    { id: "D-006", origine: "fase_1", categoria: "amministrativa", criterio: null, testo: "La cauzione provvisoria va costituita al 2 % o all'1 % con certificazione ISO?", perche: "", fonte: "disciplinare, par. 9", stato: "superata", superata_da: "D-001", motivo_superata: "chiarito dalla stazione appaltante con la FAQ n. 3", creata_il: iso(60 * 48), risposta: "", risposta_il: null, inviata_il: null },
  ],
  indicazioni: { tono: "", priorita: [], vincoli: [], opportunita: [], note: "", aggiornate_il: null, inviate_il: null },
  invii: [],
}
const CRITERI = [
  { id: "C1", etichetta: "C1 — Involucro, infissi ed efficientamento acustico" }, { id: "C2", etichetta: "C2 — Energie rinnovabili e sistemi di sicurezza" },
  { id: "C3", etichetta: "C3 — Logistica di cantiere e dotazioni" }, { id: "C4", etichetta: "C4 — Accessibilità universale e criteri CAM" },
]
const ETICHETTE = {
  categorie: { amministrativa: "Amministrativa", quesito_sa: "Quesito alla stazione appaltante", tecnica: "Tecnica", strategica: "Strategica", informazione: "Informazione del professionista" },
  origini: { fase_1: "Fase 1 · disciplinare", fase_2: "Fase 2 · elaborati", fase_3: "Fase 3 · analisi strategica", integrazione: "Integrazione di un documento", professionista: "Professionista" },
}

const OUTPUT_COMPLETO = [
  "01_extracted/disciplinare.md", "01_extracted/capitolato.md", "02_graph/index.md", "02_graph/documents/G-01_disciplinare.md", "02_graph/documents/G-02_relazione.md",
  "02_graph/criteria/criterion_C1.md", "02_graph/criteria/criterion_C2.md", "02_graph/proposals/P-C2-001_predittiva.md",
  "03_criteria/criteria_matrix.md", "03_criteria/gara_brief.md", "03_criteria/strategy_audit.md", "11_view/03_criteria/gara_brief.html", "11_view/03_criteria/strategy_audit.html",
  "04_doc_summaries/relazione.md", "05_criteria_outputs/C1_output.md", "05_criteria_outputs/C2_output.md", "06_registers/gap_register.md", "06_registers/proposal_register.md",
  "07_questions/domande.md", "10_offer/relazione_tecnica.md", "10_offer/D-02/computo_metrico.xlsx", "06_registers/audit_summary.md",
]
const FILE = {
  "03_criteria/criteria_matrix.md": CRITERIA_MATRIX, "03_criteria/strategy_audit.md": STRATEGY_AUDIT, "03_criteria/gara_brief.md": GARA_BRIEF,
  "06_registers/gap_register.md": GAP_REGISTER, "06_registers/proposal_register.md": PROPOSAL_REGISTER, "06_registers/audit_summary.md": AUDIT_SUMMARY,
  "10_offer/relazione_tecnica.md": RELAZIONE,
}
const DELIVERABLES = [
  { id: "D-01", criterio: "C1", nome: "Relazione tecnica", vincolo_formato: "max 40 facciate A4", fonte: "disciplinare, par. 16.1", tipo: "relazione_tecnica", agente: "offer-writer", stato: "completata" },
  { id: "D-02", criterio: "C2", nome: "Computo metrico delle migliorie", vincolo_formato: "formato xlsx firmato", fonte: "disciplinare, par. 16.2", tipo: "computo_metrico", agente: "deliverable-computo-metrico", stato: "completata" },
  { id: "D-03", criterio: "C3", nome: "Cronoprogramma", vincolo_formato: "Gantt", fonte: "disciplinare, par. 16.3", tipo: "cronoprogramma", agente: "deliverable-cronoprogramma", stato: "in_esecuzione" },
  { id: "D-04", criterio: "C4", nome: "Tavole tecniche degli interventi", vincolo_formato: "A3, scala 1:50", fonte: "disciplinare, par. 16.4", tipo: "tavole_tecniche", agente: "deliverable-tavole-tecniche", stato: "da_eseguire" },
]
const GRAFO = {
  nodi: [
    { id: "G-01", tipo: "document", etichetta: "G-01 — disciplinare", confidence: "ALTA" }, { id: "G-02", tipo: "document", etichetta: "G-02 — relazione tecnica", confidence: "ALTA" },
    { id: "G-09", tipo: "document", etichetta: "G-09 — computo metrico", confidence: "MEDIA" },
    { id: "C1", tipo: "criterion", etichetta: "Involucro, infissi ed efficientamento acustico", confidence: "ALTA" }, { id: "C2", tipo: "criterion", etichetta: "Energie rinnovabili e sistemi di sicurezza", confidence: "ALTA" },
    { id: "C3", tipo: "criterion", etichetta: "Logistica di cantiere", confidence: "MEDIA" }, { id: "C4", tipo: "criterion", etichetta: "Accessibilità e CAM", confidence: "TBD" },
    { id: "P-C2-001", tipo: "proposal", etichetta: "P-C2-001 — Manutenzione predittiva", confidence: "ALTA" }, { id: "P-C2-002", tipo: "proposal", etichetta: "P-C2-002 — Accumulo da 24 kWh", confidence: "MEDIA" },
  ],
  archi: [
    { da: "C1", a: "G-01", tipo: "supported_by" }, { da: "C1", a: "G-02", tipo: "supported_by" }, { da: "C2", a: "G-01", tipo: "supported_by" }, { da: "C2", a: "G-09", tipo: "supported_by" },
    { da: "C3", a: "G-01", tipo: "supported_by" }, { da: "P-C2-001", a: "C2", tipo: "risponde_a" }, { da: "P-C2-002", a: "C2", tipo: "risponde_a" }, { da: "P-C2-001", a: "G-02", tipo: "evidenza" },
  ],
  orfani: [], nodi_senza_frontmatter: [],
}
const RUN_LOG = { runs: [
  { fase: 1, avviato_il: iso(60 * 50), concluso_il: iso(60 * 50 - 14), modello: "opus", effort: "high", esito: "completato" },
  { fase: 2, avviato_il: iso(60 * 40), concluso_il: iso(60 * 40 - 46), modello: "opus", effort: "high", esito: "errore", errore: "Background tasks still running after 600s; terminating. Handoff della fase non scritto." },
  { fase: 2, avviato_il: iso(60 * 38), concluso_il: iso(60 * 38 - 52), modello: "opus", effort: "high", esito: "completato" },
  { fase: 3, avviato_il: iso(60 * 24), concluso_il: iso(60 * 24 - 21), modello: "opus", effort: "high", esito: "completato" },
  { fase: 4, avviato_il: iso(60 * 20), concluso_il: iso(60 * 20 - 3), modello: "sonnet", effort: "medium", esito: "completato" },
  { fase: 5, avviato_il: iso(60 * 18), concluso_il: iso(60 * 18 - 95), modello: "opus", effort: "high", esito: "completato" },
] }
const PROPOSTA_NODO = { frontmatter: { titolo: "Manutenzione predittiva con sensori di vibrazione sugli argani", criterio: "C2", sottocriterio: "C2.1", punteggio_stimato: 12, confidence: "ALTA", stato: "proposta", evidence_documents: [{ doc: "G-02", sezione: "par. 4.3", estratto: "Report di manutenzione 2024: fermi macchina ridotti del 38 % con il monitoraggio delle vibrazioni." }] },
  corpo: "La proposta installa sensori di vibrazione triassiali sugli argani dei nove impianti, con analisi predittiva dei guasti.\n\nI dati alimentano un cruscotto condiviso con la direzione tecnica dell'ASL e attivano gli interventi prima del fermo.\n\nLa prova documentale è il report di manutenzione 2024 su un impianto analogo, allegato 7." }

// ----------------------------------------------------------------- gare

const SINTESI = { 6: "Quattro proposte in attesa di decisione, una già approvata. Il gap G-C1-001 resta senza proposta.", 2: "Ventidue elaborati letti, 7 criteri collegati. Due discordanze registrate come domande.", 3: "Viabilità del cantiere critica: tre impianti sono l'unico accesso ai reparti." }
let gare = [
  { slug: "manutenzione-elevatori-asl-na3", nome: "Servizio di manutenzione degli impianti elevatori, ASL Napoli 3 Sud", regione: "Campania", anno_prezzario: 2026, modello: "opus", effort: "high", creato_il: iso(60 * 24 * 9), stato: "creata", prezzario_disponibile: true,
    fasi: fasi(["completata", "completata", "completata", "completata", "completata", "da_rivedere"], SINTESI), scadenza: giorni(14), output: OUTPUT_COMPLETO, documenti: 5 },
  { slug: "riqualificazione-scuola-via-roma", nome: "Riqualificazione energetica della scuola primaria di via Roma, Comune di Potenza", regione: "Basilicata", anno_prezzario: 2025, modello: "opus", effort: "high", creato_il: iso(60 * 24 * 2), stato: "creata", prezzario_disponibile: true,
    fasi: fasi(["completata", "in_esecuzione"]), scadenza: giorni(40), output: OUTPUT_COMPLETO.slice(0, 11), documenti: 4 },
  { slug: "adeguamento-sismico-palestra", nome: "Lavori di adeguamento sismico della palestra comunale, Comune di Cosenza", regione: "Calabria", anno_prezzario: 2024, modello: "sonnet", effort: "medium", creato_il: iso(60 * 24 * 5), stato: "creata", prezzario_disponibile: false,
    fasi: fasi(["completata", "completata", "errore"], SINTESI), scadenza: giorni(6), output: OUTPUT_COMPLETO.slice(0, 10), documenti: 6 },
  { slug: "verde-pubblico-rc-2026", nome: "Manutenzione del verde pubblico 2026, Comune di Reggio Calabria", regione: "Calabria", anno_prezzario: 2025, modello: "opus", effort: "medium", creato_il: iso(60 * 24 * 30), stato: "creata", prezzario_disponibile: true,
    fasi: fasi(Array(8).fill("completata")), scadenza: giorni(-2), output: OUTPUT_COMPLETO, documenti: 14 },
  { slug: "arredi-scolastici-matera-istituto-comprensivo-lotto-2-annualita-2026", nome: "", regione: "Basilicata", anno_prezzario: 2025, modello: "sonnet", effort: "low", creato_il: iso(3), stato: "creata", prezzario_disponibile: true,
    fasi: {}, scadenza: null, output: [], documenti: 0 },
]
const domandePerGara = new Map()
const registroDomande = (slug) => {
  if (!domandePerGara.has(slug)) domandePerGara.set(slug, structuredClone(DOMANDE))
  const d = domandePerGara.get(slug)
  const perId = Object.fromEntries((d.indicazioni.priorita || []).map((p) => [p.id, p]))
  d.indicazioni.priorita = CRITERI.map((c) => perId[c.id] || { id: c.id, livello: "", indicazione: "" })
  const mancanti = []
  if (!d.indicazioni.tono) mancanti.push("tono generale")
  for (const p of d.indicazioni.priorita) if (!p.livello && !p.indicazione) mancanti.push(`priorità di ${p.id}`)
  const daInviare = d.domande.filter((x) => (x.risposta || "").trim() && (!x.inviata_il || (x.risposta_il || "") > x.inviata_il)).map((x) => x.id)
  return { ...d, criteri: CRITERI, mancanti, da_inviare: daInviare, etichette: ETICHETTE }
}
const documentiDi = (g) => {
  const base = [
    { nome_file: "Disciplinare_di_gara.pdf", percorso: "input/disciplinare/Disciplinare_di_gara.pdf", categoria: "disciplinare", caricato_il: iso(60 * 24 * 9), contesto: "fase", errore_integrazione: null },
    { nome_file: "Capitolato_speciale.pdf", percorso: "input/elaborati/Capitolato_speciale.pdf", categoria: "elaborati", caricato_il: iso(60 * 24 * 9), contesto: "fase", errore_integrazione: null },
    { nome_file: "RS-01_Relazione_tecnica.pdf", percorso: "input/elaborati/RS-01_Relazione_tecnica.pdf", categoria: "elaborati", caricato_il: iso(60 * 24 * 8), contesto: "integrato", errore_integrazione: null },
    { nome_file: "G-09_Computo_metrico.xlsx", percorso: "input/elaborati/G-09_Computo_metrico.xlsx", categoria: "elaborati", caricato_il: iso(60 * 5), contesto: "da_integrare", errore_integrazione: null },
    { nome_file: "Offerta_firmata.pdf.p7m", percorso: "input/p7m/Offerta_firmata.pdf.p7m", categoria: "p7m", caricato_il: iso(60 * 24 * 7), contesto: "fase", errore_integrazione: null },
  ]
  return base.slice(0, g.documenti)
}
const prezzari = [
  { regione: "Basilicata", anno: 2025, importato_il: iso(60 * 24), totale_voci: 17928 },
  { regione: "Calabria", anno: 2025, importato_il: iso(60 * 24), totale_voci: 11077 },
  { regione: "Campania", anno: 2026, importato_il: iso(60 * 24), totale_voci: 31755 },
]
const chat = { assistente: new Map(), interventi: new Map() }
const approvazioni = []
const streamAperti = new Set()

const json = (res, codice, corpo) => { res.writeHead(codice, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(corpo === undefined ? "" : JSON.stringify(corpo)) }
const testo = (res, codice, corpo, tipo = "text/markdown; charset=utf-8") => { res.writeHead(codice, { "Content-Type": tipo }); res.end(corpo) }
const leggiCorpo = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}) } catch { ok({}) } }) })
const scarta = (req) => new Promise((ok) => { req.on("data", () => {}); req.on("end", ok) })
const dormi = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** Esegue una fase: in esecuzione per qualche secondo, poi completata (o
    al checkpoint, per 6 e 8); le fasi a valle completate tornano da rivedere. */
function avviaFase(g, n, tipo) {
  const k = CHIAVI[n - 1]
  if (tipo === "approva") { g.fasi[k] = { ...g.fasi[k], stato: "completata", richiede_approvazione: false, conclusa_il: new Date().toISOString() }; return }
  g.fasi[k] = { ...(g.fasi[k] || {}), stato: "in_esecuzione", iniziata_il: new Date().toISOString(), conclusa_il: null, richiede_approvazione: false }
  setTimeout(() => {
    g.fasi[k] = { ...g.fasi[k], stato: "completata", conclusa_il: new Date().toISOString(), richiede_approvazione: n === 6 || n === 8 }
    if (n === 4) { const d = domandePerGara.get(g.slug); if (d) { const t = new Date().toISOString(); for (const x of d.domande) if ((x.risposta || "").trim()) x.inviata_il = t; d.indicazioni.inviate_il = t; d.invii.push({ inviato_il: t, run_id: `run-${Date.now()}`, domande: d.domande.filter((x) => x.risposta).map((x) => x.id) }) } }
  }, 8000)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const p = url.pathname
  console.log(new Date().toISOString().slice(11, 19), scenario.padEnd(14), req.method, p)

  if (p.startsWith("/_scenario/")) {
    scenario = p.slice("/_scenario/".length)
    // Gli stream già aperti vengono chiusi: così si prova anche la perdita della connessione in tempo reale.
    if (scenario !== "normale") { for (const s of streamAperti) s.end(); streamAperti.clear() }
    return json(res, 200, { scenario })
  }
  if (p === "/_scenario") return json(res, 200, { scenario })
  if (scenario === "timeout") return
  if (scenario === "rete") return req.socket.destroy()
  if (scenario === "lento") await dormi(4000)
  if (scenario === "errore") return json(res, 503, { detail: "Database bloccato: riprova fra qualche secondo." })

  if (p === "/salute") return json(res, 200, { servizio: "SPADA API (finto)", stato: "attivo" })
  if (p === "/sistema/prezzari") return json(res, 200, scenario === "senza-prezzari" ? [] : prezzari)
  if (p === "/sistema/auth") return json(res, 200, { disponibile: true, stima_scadenza: { giorni_alla_scadenza_stimata: 212, nota: "stima dal token" } })
  if (p === "/sistema/pipeline") return json(res, 200, { versione: "0.11.0", git_ref: "adc9761" })
  if (p === "/sistema/prezzari/importa") { await dormi(1500); return json(res, 200, { importato: true }) }

  if (p === "/gare" && req.method === "GET") {
    const lista = scenario === "vuoto" ? [] : gare
    return json(res, 200, lista.map(({ scadenza, output, documenti, ...g }) => ({ ...g, fase_corrente: null })))
  }
  if (p === "/gare" && req.method === "POST") {
    const b = await leggiCorpo(req)
    if (gare.some((g) => g.slug === b.slug)) return json(res, 409, { detail: `Gara '${b.slug}' esiste già.` })
    if (b.slug === "fallisci-creazione") return json(res, 500, { detail: "new_gara.sh fallito: directory non scrivibile" })
    await dormi(1500)
    gare.unshift({ ...b, creato_il: new Date().toISOString(), stato: "creata", fasi: {}, prezzario_disponibile: prezzari.some((x) => x.regione.toLowerCase() === String(b.regione).toLowerCase() && x.anno === b.anno_prezzario), scadenza: null, output: [], documenti: 0 })
    return json(res, 201, { slug: b.slug, creato: true })
  }

  const m = p.match(/^\/gare\/([^/]+)(\/.*)?$/)
  if (!m) return json(res, 404, { detail: "Not Found" })
  const g = gare.find((x) => x.slug === decodeURIComponent(m[1]))
  if (!g) return json(res, 404, { detail: "Gara non trovata." })
  const sotto = m[2] || ""
  const slug = g.slug

  if (sotto === "" && req.method === "DELETE") {
    if (Object.values(g.fasi).some((f) => f.stato === "in_esecuzione")) return json(res, 409, { detail: "Una fase è in esecuzione su questa gara: attendi la conclusione prima di eliminarla." })
    gare = gare.filter((x) => x !== g); return json(res, 204)
  }
  if (sotto === "") {
    const corrente = CHIAVI.findIndex((k) => g.fasi[k]?.stato !== "completata") + 1 || 8
    return json(res, 200, {
      manifest: { nome: g.nome, gara: { nome: g.nome, CIG: "B2F1A9C0E7", scadenza_offerta: g.scadenza }, esecuzione: { modello: g.modello, effort: g.effort }, prezzario: { regione: g.regione, anno: g.anno_prezzario }, criteri_stato: g.fasi["5_elaborazione_criteri"]?.stato === "completata" ? { C1: { analizzato: true }, C2: { analizzato: true }, C3: { analizzato: true } } : {} },
      fasi: { versione_fasi: 2, fase_corrente: corrente, fasi: g.fasi }, attivita: g.fasi["2_costruzione_grafo"]?.stato === "in_esecuzione" ? { aggiornato_il: iso(0), agenti_attivi: [{ agente: "graph-builder", descrizione: "Round B: collegamento degli elaborati ai criteri" }], agenti_conclusi: [{ agente: "doc-extractor", descrizione: "Estrazione di 22 elaborati", stato: "concluso" }] } : {},
      prezzario: { regione: g.regione, anno: g.anno_prezzario, disponibile: g.prezzario_disponibile, da_rielaborare: g.prezzario_disponibile && slug === "verde-pubblico-rc-2026" ? [{ tipo: "fase", fase: 3, etichetta: "Fase 3" }] : [] },
    })
  }
  if (sotto === "/output") return json(res, 200, g.output)
  if (sotto.startsWith("/output/")) { const f = decodeURIComponent(sotto.slice(8)); return FILE[f] ? testo(res, 200, FILE[f]) : g.output.includes(f) ? testo(res, 200, `# ${f}\n\nContenuto di prova.`) : json(res, 404, { detail: `File non trovato: ${f}` }) }
  if (sotto === "/documenti" && req.method === "GET") return json(res, 200, documentiDi(g))
  if (sotto === "/documenti" && req.method === "POST") { await scarta(req); await dormi(1200); g.documenti = Math.min(g.documenti + 1, 5); return json(res, 200, { caricato: "documento.pdf", categoria: url.searchParams.get("categoria"), fasi_completate_da_valutare: g.fasi["2_costruzione_grafo"]?.stato === "completata" ? [] : [1], messaggio: "Documento caricato." }) }
  if (sotto === "/documenti/integra") { await leggiCorpo(req); return json(res, 202, { job_id: 99, stato: "in_coda" }) }
  if (sotto === "/brief/riallinea") return json(res, 202, { job_id: 98, stato: "in_coda" })
  if (sotto === "/run-log") return json(res, 200, g.output.length ? RUN_LOG : { runs: [] })
  if (sotto === "/deliverables") return json(res, 200, g.output.includes("10_offer/relazione_tecnica.md") ? DELIVERABLES : [])
  if (sotto === "/grafo") return json(res, 200, g.output.includes("02_graph/index.md") ? GRAFO : { nodi: [], archi: [], orfani: [], nodi_senza_frontmatter: [] })
  if (sotto === "/proposte-operatore" && req.method === "GET") return json(res, 200, [{ id: 1, criterio: "C2", gap_id: "G-C2-002", titolo: "Batterie LFP invece di NMC", descrizione: "Maggiore sicurezza in ambiente ospedaliero.", creato_il: iso(60 * 6), stato: "in_attesa" }])
  if (sotto === "/proposte-operatore" && req.method === "POST") { await leggiCorpo(req); return json(res, 201, { id: 2, creato: true }) }
  if (sotto === "/approvazioni") { const b = await leggiCorpo(req); approvazioni.push(b); return json(res, 201, { id: approvazioni.length }) }
  if (sotto === "/domande" && req.method === "GET") return json(res, 200, registroDomande(slug))
  if (sotto === "/domande" && req.method === "PUT") {
    const b = await leggiCorpo(req); const d = domandePerGara.get(slug) || (registroDomande(slug), domandePerGara.get(slug))
    for (const [id, r] of Object.entries(b.risposte || {})) { const x = d.domande.find((y) => y.id === id); if (x) { x.risposta = r; x.risposta_il = new Date().toISOString() } }
    if (b.indicazioni) d.indicazioni = { ...d.indicazioni, ...b.indicazioni, aggiornate_il: new Date().toISOString() }
    return json(res, 200, registroDomande(slug))
  }
  if (sotto === "/domande/informazioni") { const b = await leggiCorpo(req); const d = (registroDomande(slug), domandePerGara.get(slug)); const id = `D-${String(d.domande.length + 1).padStart(3, "0")}`; d.domande.push({ id, origine: "professionista", categoria: "informazione", criterio: b.criterio || null, testo: b.titolo, perche: "", fonte: "", stato: "aperta", superata_da: null, motivo_superata: "", creata_il: new Date().toISOString(), risposta: b.testo, risposta_il: new Date().toISOString(), inviata_il: null }); return json(res, 201, registroDomande(slug)) }
  if (sotto.startsWith("/domande/") && req.method === "DELETE") { const d = (registroDomande(slug), domandePerGara.get(slug)); d.domande = d.domande.filter((x) => x.id !== decodeURIComponent(sotto.slice(9))); return json(res, 200, registroDomande(slug)) }
  const mp = sotto.match(/^\/proposte\/([^/]+)$/)
  if (mp) return decodeURIComponent(mp[1]) === "P-C2-001" ? json(res, 200, PROPOSTA_NODO) : json(res, 404, { detail: "Nodo proposta non trovato (feedback non ancora elaborato?)" })
  const mf = sotto.match(/^\/fasi\/(\d)\/(esegui|riesegui|approva)$/)
  if (mf) { avviaFase(g, Number(mf[1]), mf[2]); return json(res, 202, { job_id: Date.now(), stato: "in_coda" }) }
  const md = sotto.match(/^\/deliverables\/([^/]+)\/(esegui|riesegui)$/)
  if (md) { const d = DELIVERABLES.find((x) => x.id === decodeURIComponent(md[1])); if (d) { d.stato = "in_esecuzione"; setTimeout(() => { d.stato = "completata" }, 8000) } return json(res, 202, { job_id: Date.now(), stato: "in_coda" }) }
  if (sotto === "/assistente" && req.method === "GET") return json(res, 200, chat.assistente.get(slug) || [])
  if (sotto === "/assistente" && req.method === "POST") {
    const b = await leggiCorpo(req); const l = chat.assistente.get(slug) || []; l.push({ ruolo: "utente", testo: b.messaggio, creato_il: new Date().toISOString() }); chat.assistente.set(slug, l)
    await dormi(1500)
    const risposta = `**Penali previste** (disciplinare, art. 24):\n\n1. **Ritardo di intervento** oltre 90 minuti: 250 euro per ogni ora.\n2. **Fermo impianto** oltre 24 ore: 500 euro al giorno.\n3. Mancata reperibilità: 1.000 euro per evento.\n\nLe penali non possono superare il 10 % dell'importo contrattuale (vedi \`G-01\`, par. 24.3).`
    l.push({ ruolo: "assistente", testo: risposta, creato_il: new Date().toISOString() }); return json(res, 200, { risposta })
  }
  if (sotto === "/interventi" && req.method === "GET") return json(res, 200, chat.interventi.get(slug) || [])
  if (sotto === "/interventi" && req.method === "POST") {
    const b = await leggiCorpo(req); const l = chat.interventi.get(slug) || []; l.push({ ruolo: "utente", testo: b.messaggio, creato_il: new Date().toISOString() }); chat.interventi.set(slug, l)
    await dormi(2000)
    const risposta = "Fatto. Ho sostituito la voce E.14.20 con E.14.18 in `10_offer/D-02/computo_metrico.xlsx` e riaccodato il job del deliverable D-02."
    l.push({ ruolo: "claude", testo: risposta, creato_il: new Date().toISOString() }); return json(res, 200, { risposta, session_id: "s-1" })
  }
  if (sotto === "/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
    let ultimo = ""
    const manda = () => { const payload = JSON.stringify({ fasi: { versione_fasi: 2, fasi: g.fasi }, attivita: {} }); if (payload !== ultimo) { res.write(`data: ${payload}\n\n`); ultimo = payload } else res.write(": keep-alive\n\n") }
    streamAperti.add(res); manda(); const t = setInterval(manda, 2000); req.on("close", () => { clearInterval(t); streamAperti.delete(res) }); return
  }
  json(res, 404, { detail: "Not Found" })
})

server.listen(PORTA, "127.0.0.1", () => console.log(`backend finto su http://127.0.0.1:${PORTA}  scenario=${scenario}`))
