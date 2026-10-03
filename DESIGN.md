# DESIGN.md, fonte di verità del design di SPADA Online

Questo file vince su qualunque skill, preset o default di libreria. Se una
skill propone qualcosa che contraddice una regola scritta qui, si applica
questa. Le skill restano utili per il metodo e per i casi che qui non sono
coperti.

Direzione scelta: identità visiva e colori della direzione "piano di
lavoro" (base zinc neutra, un solo accento cobalto, Geist), con l'elenco
gare a card e lo stepper della pagina gara della direzione "acciaio e
bronzo" (binario delle sette fasi come firma visiva).

Lettura del brief: redesign totale di un'interfaccia di prodotto B2B, un
banco di lavoro per professionisti italiani che preparano offerte di gara,
con un linguaggio calmo e affidabile. Dial: varianza 5, motion 4, densità 5.

## 1. Principi di tono visivo

1. **Il colore è informazione.** Un solo accento per le azioni e per ciò
   che il sistema sta facendo. Quattro colori di stato, mai decorativi.
   Tutto il resto è neutro.
2. **Una sola cosa memorabile: il binario delle sette fasi.** Compare in
   piccolo in ogni card e per esteso nella pagina gara. Il resto è quieto.
3. **Superfici piatte.** Bordi sottili, nessun vetro, nessuna sfocatura,
   nessuna sfumatura di sfondo. L'elevazione esiste solo per ciò che
   galleggia davvero: menu, popover, pannelli, finestre.
4. **Struttura, non decorazione.** Bordi, numeri, raggruppamenti e colori
   compaiono solo quando codificano qualcosa: una sequenza, uno stato, una
   gerarchia.
5. **La forma segue lo stato.** Ogni dato ha cinque stati espliciti,
   caricamento, vuoto, successo, errore, assente, e l'interfaccia li
   mostra sempre; non si deduce mai dall'assenza di contenuto.
6. **Il testo lavora.** Voce attiva, frase minima, verbo che dice cosa
   succede. Un bottone "Approva la fase" produce la conferma "Fase
   approvata". Gli errori dicono cosa è successo e cosa fare.

## 2. Colori

Definiti come variabili CSS in `app/web/src/index.css`, in `oklch` o esadecimale.
Tema chiaro di default, tema scuro con `[data-theme="dark"]` o con
`prefers-color-scheme: dark` quando l'attributo manca.

### Neutri

| Token | Chiaro | Scuro | Uso |
|---|---|---|---|
| `--background` | `#f4f5f7` | `#121214` | tela della pagina |
| `--card` | `#fcfcfd` | `#1a1a1e` | card, pannelli, barra |
| `--muted` | `#eceef1` | `#232329` | superfici secondarie, chip, skeleton |
| `--foreground` | `#18181b` | `#f1f1f3` | titoli, testo primario |
| `--foreground-2` | `#52525b` | `#a1a1aa` | corpo, etichette |
| `--muted-foreground` | `#7a7a85` | `#7c7c87` | secondario, segnaposto |
| `--border` | `rgba(24,24,27,.10)` | `rgba(255,255,255,.09)` | hairline |
| `--border-strong` | `rgba(24,24,27,.17)` | `rgba(255,255,255,.16)` | campi, controlli |
| `--scrim` | `rgba(24,24,27,.38)` | `rgba(0,0,0,.55)` | dietro a pannelli e finestre |

Mai nero puro, mai bianco puro, mai grigi caldi mescolati a grigi freddi.

### Accento

| Token | Chiaro | Scuro |
|---|---|---|
| `--primary` | `oklch(0.49 0.15 262)` | `oklch(0.74 0.12 262)` |
| `--primary-foreground` | `#ffffff` | `#0e1733` |
| `--primary-soft` | `oklch(0.49 0.15 262 / 0.10)` | `oklch(0.74 0.12 262 / 0.16)` |

L'accento serve a: bottone primario, link, scheda attiva, anello di focus,
stato "in esecuzione". Non serve a: titoli, sfondi di sezione, icone
decorative.

### Stati

| Stato | Token | Chiaro | Scuro | Significato |
|---|---|---|---|---|
| in esecuzione | `--status-run` | = `--primary` | = `--primary` | il sistema sta lavorando |
| da rivedere | `--status-attn` | `oklch(0.52 0.13 68)` | `oklch(0.80 0.14 80)` | tocca a te |
| completata | `--status-ok` | `oklch(0.50 0.13 150)` | `oklch(0.76 0.14 150)` | fatto |
| errore | `--status-crit` | `oklch(0.51 0.18 25)` | `oklch(0.72 0.17 25)` | rotto, serve un intervento |
| in coda | `--status-neu` | `#71717a` | `#8b8b95` | non ancora iniziato |

Ogni stato ha la variante `-soft` per gli sfondi dei badge (alpha 0.11 in
chiaro, 0.15 in scuro). Gli avvisi non di stato, come "senza prezzario",
usano `--status-attn`. `--destructive` di shadcn è `--status-crit`.

Il binario delle fasi usa: fase conclusa `--foreground-2`, fase corrente il
colore del suo stato, fase futura `--border-strong`.

## 3. Tipografia

- Testo: **Geist** variabile, self-hosted da `@fontsource-variable/geist`.
- Dati: **Geist Mono** variabile, per slug, identificativi, CIG, importi,
  conteggi, date brevi, con `font-variant-numeric: tabular-nums`.
- Nessuna richiesta a Google Fonts in produzione.
- Pesi: 400, 500, 600. Mai 700.

| Token | Dimensione | Interlinea | Uso |
|---|---|---|---|
| `--text-micro` | 11px | 1.45 | contatori, note nei campi |
| `--text-xs` | 12px | 1.5 | metadati, chip, badge |
| `--text-sm` | 13px | 1.5 | interfaccia di default |
| `--text-base` | 14px | 1.6 | corpo dei documenti, prosa lunga |
| `--text-md` | 16px | 1.5 | titoli di sezione |
| `--text-lg` | 18px | 1.3 | titolo della gara |
| `--text-xl` | 22px | 1.25 | titolo di pagina |
| `--text-2xl` | 28px | 1.2 | raro, stati vuoti di pagina |

Tracking: `-0.01em` da 18px, `-0.015em` da 22px. Misura di lettura della
prosa: 65 caratteri. Titoli in forma di frase, mai in maiuscolo, mai con
una sola parola colorata. Nessuna etichetta in maiuscolo spaziato sopra ai
titoli.

## 4. Forma, spazio, superfici

**Raggi, una sola scala.** 4px chip e badge, 8px controlli nella taglia
normale (bottoni, campi) e contenitori (card, pannelli, menu), 6px
controlli nelle taglie piccole, 12px finestre. Sono i token `--radius-sm`,
`--radius-md`, `--radius-lg`, `--radius-xl` che shadcn applica da solo. Mai
pillole, tranne il pallino di stato. Raggio interno = raggio esterno meno
il padding, quando un contenitore ne contiene un altro.

**Spaziatura, scala a 4.** 4, 8, 12, 16, 20, 24, 32, 48. Padding delle
card 14 a 16px. Larghezza massima del contenuto: 1200px elenco, 1280px
pagina gara. Margini laterali 24px, 16px sotto i 768px.

**Superfici.** Card su `--card` con bordo `--border`, senza ombra. Chip su
`--muted`. Campi su `--card` con bordo `--border-strong`. Nessun
`backdrop-filter`.

**Ombre, solo per ciò che galleggia.**

| Token | Chiaro | Uso |
|---|---|---|
| `--shadow-pop` | `0 8px 24px rgba(24,24,27,.10), 0 1px 2px rgba(24,24,27,.06)` | menu, popover, tooltip |
| `--shadow-sheet` | `0 16px 48px rgba(24,24,27,.16)` | pannelli laterali, finestre |

In scuro le stesse con nero a 0.45 e 0.6. Tinte, mai nero puro al 30%.

**Icone.** Phosphor, peso regular, una sola famiglia. 14px nel testo, 16px
nei bottoni, 20px negli stati vuoti. Mai icone disegnate a mano.

**Focus.** Anello `2px solid var(--primary)` con offset 2px, sempre
visibile da tastiera, mai rimosso.

## 5. Componenti e pattern

I componenti vengono da shadcn/ui, base Radix, icone Phosphor, aggiunti con
`npx shadcn@latest add`. Si personalizzano solo tramite i token di
`index.css`: niente classi arbitrarie nei file generati, niente stili
inline.

- **Elenco gare**: griglia di card, minimo 320px per colonna. Card: badge
  di stato e slug, titolo a due righe massimo, chip (regione e anno,
  modello, effort), binario delle sette fasi con legenda "Fase n, titolo"
  e tempo relativo, piede con elaborati, scadenza e avviso. La card è
  interamente cliccabile; il cestino è un'azione secondaria sul bordo.
- **Filtri**: schede con conteggio in mono, una attiva alla volta. La
  ricerca è un campo a destra. "Nessun risultato" è distinto da "nessuna
  gara".
- **Badge di stato**: rettangolo 4px, testo in forma di frase, sfondo
  `-soft`, testo nel colore dello stato. Il pallino compare solo quando
  pulsa, cioè solo in "in esecuzione".
- **Stepper della pagina gara**: sette celle in riga, barra superiore da
  3px colorata per stato, numero in mono e titolo sotto. La fase corrente
  ha il titolo in 600.
- **Pannelli e finestre**: "Nuova gara" è un pannello laterale ancorato a
  destra, 420 a 480px, con scrim; l'elenco resta visibile. Conferme
  distruttive in una finestra centrata con il nome della gara nel testo,
  mai `confirm()`.
- **Campi**: etichetta sopra, aiuto sotto, errore sotto nel colore
  `--status-crit`. Mai il segnaposto al posto dell'etichetta.
- **Conferme**: sul controllo che le ha causate, quando esiste ("Approvata"
  resta sul bottone). Toast solo per esiti senza origine sullo schermo.
- **Skeleton**: stessa forma e altezza del contenuto finale, mai spinner a
  tutta pagina. Stato vuoto con spiegazione e un'azione.
- **Errore**: cosa è successo, codice e percorso se noti, cosa non è
  cambiato, un bottone "Riprova".

## 6. Motion

Durate ed easing sono token; i componenti li usano, non ne inventano.

| Token | Valore | Uso |
|---|---|---|
| `--d-fast` | 120ms | hover di colore, pressione |
| `--d-base` | 180ms | hover con trasformazione, tooltip, scheda che cambia, crossfade skeleton e contenuto |
| `--d-enter` | 240ms | apertura di menu, popover, finestra, pannello |
| `--d-move` | 280ms | scorrimento di pannelli, cambio vista |
| `--d-exit` | 140ms | ogni chiusura |
| `--e-enter` | `cubic-bezier(0.22, 1, 0.36, 1)` | ingressi, hover con trasformazione |
| `--e-move` | `cubic-bezier(0.25, 1, 0.5, 1)` | scorrimenti |
| `--e-std` | `cubic-bezier(0.4, 0, 0.2, 1)` | colore e opacità |
| `--e-press` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | pressione |

**Quando animare.** Solo in risposta a un'azione o a un cambio di stato:
apertura e chiusura, crossfade fra skeleton e contenuto e fra contenuto ed
errore, scheda che cambia, pressione (`scale(0.98)` a 0ms), hover. Il
pallino di "in esecuzione" pulsa a 1.6s finché la fase gira.

**Quando non animare.** Mai al caricamento della pagina, mai a cascata su
elenchi, mai allo scroll, mai parallasse, mai `transition: all`, mai
proprietà di layout (`width`, `height`, `top`, `left`). Pannelli e finestre
entrano dal lato del controllo che li ha aperti, con `scale` da 0.96 e
opacità, mai da 0.

**Cambio tema.** Le transizioni si spengono durante il cambio
(`[data-theme-switching] * { transition: none }`) e si riaccendono al
frame successivo.

**Reduced motion.** Con `prefers-reduced-motion: reduce` ogni spostamento
diventa un crossfade di opacità da 120ms al massimo e il pallino smette di
pulsare. Il feedback alle azioni resta.

## 7. Testi

- Forma di frase ovunque, anche nei bottoni e nei badge.
- Mai trattini lunghi né puntini mediani nei testi dell'interfaccia:
  virgole, punti o spazi.
- Le azioni dicono cosa succede: "Crea e carica documenti", "Rivedi le
  proposte", "Riprova". Lo stesso nome lungo tutto il flusso.
- I numeri si scrivono in mono e in forma breve: "14 g", "18 min fa",
  "12 elaborati".
- Niente punti esclamativi, niente "Oops", niente scuse.
