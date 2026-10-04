# Fase 4 — Domande al professionista (invio delle risposte)

Dipende da: `_state/handoff/3_analisi_strategica.json`.

Questa fase è il gate fra l'analisi e la ricerca delle soluzioni. Il
professionista ha risposto (dall'interfaccia) alle domande raccolte
nelle Fasi 1-3 e dalle integrazioni, ha dato le indicazioni strategiche
(tono, priorità per criterio, vincoli, opportunità) e può aver aggiunto
informazioni di sua iniziativa. Eseguire la fase significa **inviare**
tutto questo: da qui in avanti è contesto della gara.

Prima di te, `spada-fase` ha già scritto in modo deterministico:
- `output/07_questions/risposte_professionista.md` — il digest completo
  di risposte, indicazioni e domande senza risposta;
- il paragrafo «Risposte e indicazioni del professionista (Fase 4)» in
  `_state/memoria.md`.
Non riscriverli e non riassumerli: sono le parole del professionista.

## Esecuzione

1. `answers-integrator` — porta risposte e indicazioni nel knowledge
   graph: `02_graph/professionista.md`, frontmatter
   `informazioni_professionista` delle pagine criterio, dati dichiarati
   in `02_graph/economic_framework.md`, riga in `02_graph/log.md`.
2. `brief-writer` con motivo **«Fine Fase 4 (risposte)»** — sezione
   «Informazioni dal professionista», «Indicazione del professionista»
   in ogni criterio, Scadenze (adempimenti confermati), Quadro
   tecnico-economico (dati dichiarati), Potenziale, Vincoli, Prossimi
   passi.

Se il digest dice che nessuna risposta è nuova o cambiata rispetto
all'invio precedente, e le indicazioni non sono cambiate, i due agenti
verificano soltanto che grafo e brief siano allineati.

## A fine fase

Scrivi `_state/handoff/4_domande_professionista.json`:
- `entita_chiave`: numero di risposte e informazioni inviate, domande
  rimaste senza risposta, criteri toccati
- `riferimenti`: `output/07_questions/risposte_professionista.md`,
  `02_graph/professionista.md`, `output/03_criteria/gara_brief.md`
- `alert`: domande rimaste senza risposta che riguardano una scadenza o
  un criterio ad alta priorità

(Le indicazioni e le risposte come `decisioni` le aggiunge `spada-fase`
dopo di te: non serve che tu le ricopi.)

Aggiungi un paragrafo a `_state/memoria.md` solo su ciò che hai
integrato nel grafo e nel brief (il paragrafo con le risposte esiste già).
