# Sprint 6 — Frontend

Vedi `app/frontend/README.md` per il dettaglio implementativo e la
verifica eseguita (backend + frontend avviati realmente, pagina
caricata in Chromium headless via Playwright, due difetti reali trovati
e corretti grazie al test in browser — non dalla sola lettura del
codice).

## Riepilogo rispetto ai criteri del piano

- Elenco gare, creazione — fatto.
- Pagina gara: intestazione, sintesi NL, barra 7 fasi, card fase con
  azione, vista agenti adattiva, elaborati prodotti, storico run,
  upload (centrale/secondario a seconda dello stato) — fatto.
- Fase 5 come elenco navigabile per proposta, non blocco unico — fatto
  (parsing minimale della tabella markdown, non un endpoint strutturato
  dedicato: il piano non ne elenca uno tra gli endpoint Sprint 4).
- SSE per aggiornamento live — fatto.
- Log grezzo accessibile ma secondario (`<details>`) — fatto.

## Aggiunta non prevista esplicitamente nel piano

`GET /sistema/design-system.css` (backend) — necessaria perché il
frontend statico (Cloudflare Pages) e il backend (Cloudflare Tunnel)
sono origini diverse per costruzione: senza un modo di servire il
design system al frontend, o si duplicava il CSS (rischio di
divergenza, esattamente ciò che Sprint 5 vuole evitare) o si serviva da
un'unica fonte via HTTP. Scelta la seconda. Aggiunta anche la CORS
middleware al backend per lo stesso motivo (origini diverse).

## Non ancora fatto

Vedi `app/frontend/README.md` §Non ancora fatto: esecuzione di fase
reale non osservata (richiede worker con autenticazione Claude vera),
proposte non strutturate via endpoint dedicato, nessun toggle
tema chiaro/scuro.
