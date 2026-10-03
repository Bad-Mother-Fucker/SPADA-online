# `app/web/` — SPADA Online, interfaccia nuova

Vite + React + TypeScript + Tailwind v4 + shadcn/ui (base Radix, icone
Phosphor) + TanStack Query. Le regole di design stanno in `DESIGN.md` nella
radice del repository e hanno la precedenza su tutto.

```
web/
├── index.html            guscio; decide il tema prima del primo paint
├── src/
│   ├── main.tsx, App.tsx provider (query, tooltip, toast) e pagina
│   ├── index.css         token del design system mappati su shadcn
│   ├── dominio/fasi.ts   le 7 fasi, gli stati, le categorie
│   ├── lib/api.ts        client del backend, con timeout ed errori tipizzati
│   ├── lib/risorsa.ts    il pattern unico di stato delle richieste
│   ├── lib/query.ts      QueryClient con le regole comuni
│   ├── lib/tema.ts       tema chiaro, scuro, sistema
│   ├── hooks/            useGare, useStatoBackend, useTema, useParametriUrl
│   └── components/
│       ├── ui/           componenti shadcn (generati, non si modificano)
│       ├── comuni/       barra applicativa
│       ├── stati/        vuoto, errore, avviso di dati non aggiornati
│       └── gare/         elenco, card, filtri, pannello Nuova gara, elimina
├── dev/
│   ├── mock-api.mjs      backend finto con scenari (vuoto, errore, lento…)
│   └── screenshot.mjs    screenshot via Chrome headless, con JS prima dello scatto
└── design/               mockup delle direzioni estetiche (Fase 1)
```

## Sviluppo

```bash
npm install
npm run dev            # http://localhost:5173, proxy verso il backend su :8000
```

Contro il backend finto, per esercitare gli stati senza toccare dati veri:

```bash
node dev/mock-api.mjs                                   # :8765
SPADA_API_URL=http://127.0.0.1:8765 npx vite --port 5174
curl http://127.0.0.1:8765/_scenario/errore             # normale, vuoto, errore, lento, timeout, rete, senza-prezzari
```

Screenshot nei due temi, anche con un pannello aperto:

```bash
node dev/screenshot.mjs "http://localhost:5174/?tema=dark" out.png --w 1440 --h 900
node dev/screenshot.mjs "http://localhost:5174/" out.png --eval "document.querySelector('button').click()"
```

## Build e servizio

`npm run build` compila in `dist/`, che FastAPI serve su `/`. In locale la
build è parte di `./spada setup`. Finché la pagina gara non è migrata, le
card aprono `/legacy/gara.html`, cioè l'interfaccia precedente.

## Regole

- Componenti solo da `npx shadcn@latest add`; personalizzazione solo tramite
  i token in `src/index.css`.
- Ogni richiesta passa da `lib/api.ts` e il suo stato da `lib/risorsa.ts`:
  caricamento, vuoto, assente, errore, ok, più `stantio`.
- Niente trattini lunghi né puntini mediani nei testi; forma di frase.
