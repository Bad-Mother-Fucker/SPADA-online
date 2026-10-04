# SPADA Online, istruzioni per Claude Code

SPADA analizza appalti pubblici: elenco gare, creazione gara, upload di
disciplinare, elaborati e PDF firmati P7M, pipeline a 8 fasi con revisione
umana (la Fase 4 raccoglie domande e indicazioni del professionista). Backend FastAPI in `app/backend`, worker in `app/worker`, pipeline
di agenti in `_pipeline`. In locale tutto parte con `./spada avvia`.

## Frontend

`app/web` è l'unica interfaccia: Vite + React + TypeScript + Tailwind v4 +
shadcn/ui (base Radix, icone Phosphor) + TanStack Query. In sviluppo gira
con `cd app/web && npm run dev` su http://localhost:5173, con proxy verso
il backend su :8000. Si compila con `npm run build` in `app/web/dist`, che
FastAPI serve su http://localhost:8000 (`./spada setup` fa la build; dopo
una modifica va rifatta). Il backend finto per gli stati di rete e lo
scatto headless degli screenshot stanno in `app/web/dev`.

Il backend non cambia: nessuna modifica ai contratti delle API senza
chiederlo prima. Prima di riavviare `./spada` controlla che nessun job
della pipeline sia in esecuzione (`./spada stato`): il worker al riavvio
marca come errore ogni job in corso.

## Design: DESIGN.md ha la precedenza

- `DESIGN.md` nella radice è la fonte di verità per colori, tipografia,
  raggi, ombre, spaziature, superfici, motion e tono. Ha la precedenza su
  qualsiasi skill, preset o default di libreria. Se una skill propone
  qualcosa che contraddice DESIGN.md, vince DESIGN.md.
- I componenti si prendono da shadcn/ui con `npx shadcn@latest add <nome>`
  e si personalizzano solo tramite i token definiti in
  `app/web/src/index.css`. Non si riscrivono i file in
  `app/web/src/components/ui` con classi arbitrarie e non si usano stili
  inline per il colore, la forma o la durata.
- Le animazioni usano le durate e gli easing di DESIGN.md (`--d-*`,
  `--e-*`) e rispettano `prefers-reduced-motion`. Niente animazioni al
  caricamento, a cascata o allo scroll.
- Prima di toccare l'aspetto di una schermata si fa la discovery UX
  (skill `ux-discovery`): utente, contesto d'uso, stati, casi limite.

## Stato delle richieste al backend

Ogni richiesta ha uno stato esplicito e modellato: idle, loading, success,
error, empty, assente. Lo gestisce TanStack Query con un unico pattern
riutilizzabile; non si ripete schermata per schermata. Ogni caricamento ha
skeleton con la forma del contenuto finale, timeout con errore
recuperabile e azione di riprova. Le azioni dell'utente hanno feedback
immediato: UI ottimistica dove è sicura, bottoni disabilitati durante
l'invio, progress per gli upload, rollback in caso di errore.

## Lavoro sul repository

- Branch del redesign: `redesign-ui`. Un commit per ogni passo completato.
- Si lavora per fasi: Fase 0 analisi, Fase 1 design system, Fase 2
  schermata pilota (elenco gare e Nuova gara), Fase 3 estensione al resto.
  Alla fine di ogni fase ci si ferma e si aspetta la conferma.
- Prima di installare una skill di terze parti si legge il suo SKILL.md e
  si riferisce cosa contiene di rilevante.
- Prima di dichiarare finita una fase si avvia l'app, si esercitano i
  flussi, compresi errore del backend e rete lenta, e si riporta cosa è
  stato provato e cosa no.

## Skill installate

In `.claude/skills`, versioni fissate in `skills-lock.json`:
`frontend-design`, `design-taste-frontend`, `redesign-existing-projects`,
`high-end-visual-design`, `minimalist-ui`, `full-output-enforcement`,
`ui-animation`. Sono guida di metodo. Su ogni conflitto vince DESIGN.md.
