# Formato dei file prodotti

Tre file nella cartella del deliverable (o nella cartella indicata dal
prompt), più la copia «generato» per l'apprendimento:

```
output/10_offer/<id>/
├── analisi_nuovi_prezzi.json      fonte di verità: input dell'analisi (nessun totale)
├── analisi_nuovi_prezzi.md        documento di lavoro per il professionista (totali calcolati)
├── analisi_nuovi_prezzi.xlsx      un foglio per nuovo prezzo, layout del foglio di riferimento
└── _generato/
    └── analisi_nuovi_prezzi.json  copia del JSON come l'hai generato tu, per il confronto
```

Il JSON contiene **solo input** (righe, quantità, costi, fonti,
percentuali): importi, totali e incidenze li calcola chi legge
(`scripts/analisi_np.py`), così un numero sbagliato non può nascondersi
in un totale scritto a mano. Il markdown li mostra. Se scrivi il
markdown senza lo script, i totali devono essere ricalcolati seguendo
la checklist di `metodo.md`.

## `analisi_nuovi_prezzi.json`

```json
{
  "schema": "analisi-nuovi-prezzi/1.0",
  "gara": "liceo-rossi-efficientamento",
  "deliverable_id": "C1-0",
  "documento": "Computo metrico delle migliorie",
  "stadio": "bozza",
  "generato_il": "2026-11-08T14:32:00Z",
  "non_estimativo": true,
  "prezzario": {
    "regione": "Campania",
    "anno": 2026,
    "identificativo": "Campania-2026-ab12cd"
  },
  "parametri": {
    "sicurezza_pct": 3.0,
    "spese_generali_pct": 15.0,
    "utile_pct": 10.0,
    "fonte": "metodo standard"
  },
  "analisi": [
    {
      "codice": "NP.OT.001",
      "descrizione_sintetica": "Pareti divisorie in pannelli HPL compatto a nucleo pieno sp. 13 mm su struttura in alluminio",
      "descrizione_estesa": "Fornitura e posa in opera di pareti divisorie per servizi igienici in pannelli di laminato HPL compatto a nucleo pieno, spessore 13 mm, classe di reazione al fuoco B-s2,d0, bordi arrotondati, su struttura portante in profili di alluminio anodizzato con piedini regolabili; comprese ferramenta in acciaio inox, serrature libero/occupato, tracciamento, tagli, sfridi, fissaggi, pulizia finale. Esclusa la demolizione delle pareti esistenti.",
      "unita_misura": "m²",
      "proposta": "Pareti divisorie dei servizi in HPL compatto",
      "criterio": "1.1 — Qualità dei materiali",
      "voce_computo": "29 — 9_CME_Computo_Metrico_Estimativo",
      "voce_prezzario_analoga": "CAM26_R02.090.070.C",
      "sezioni": {
        "manodopera": [
          {
            "n": "1.1",
            "descrizione": "Operaio specializzato (3° livello)",
            "um": "h",
            "quantita": 0.6,
            "costo_unitario": 34.97,
            "fonte": "tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip.",
            "nota": "squadra di 2, 0,6 h/m² ciascuno: tracciamento, posa struttura, posa pannelli; da analisi CAM26_R02.090.070.C (0,55) + tracciamento"
          },
          {
            "n": "1.2",
            "descrizione": "Operaio qualificato (2° livello)",
            "um": "h",
            "quantita": 0.6,
            "costo_unitario": 32.37,
            "fonte": "tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip."
          }
        ],
        "materiali": [
          {
            "n": "2.1",
            "descrizione": "Pannello HPL compatto nucleo pieno sp. 13 mm, classe B-s2,d0, compreso sfrido 8%",
            "um": "m²",
            "quantita": 1.08,
            "costo_unitario": 62.0,
            "fonte": "stima — listini produttori HPL compatto 13 mm (55–70 €/m²), nessuna voce elementare nel prezzario"
          },
          {
            "n": "2.2",
            "descrizione": "Profili in alluminio anodizzato per struttura e fissaggio",
            "um": "m",
            "quantita": 3.2,
            "costo_unitario": 6.8,
            "fonte": "prezzario Campania 2026 — CAM26_P01.010.040.B"
          }
        ],
        "mezzi_opera": [
          {
            "n": "3.1",
            "descrizione": "Attrezzatura minuta ed elettroutensili (nolo a freddo)",
            "um": "h",
            "quantita": 0.6,
            "costo_unitario": 1.9,
            "fonte": "prezzario Campania 2026 — CAM26_N.01.020.010.A"
          }
        ],
        "varie": []
      },
      "confronto": {
        "codice": "CAM26_R02.090.070.C",
        "prezzo_prezzario": 95.1,
        "spiegazione": "il pannello HPL a nucleo pieno costa circa il doppio del laminato della voce di prezzario; la posa è analoga"
      },
      "note": [
        "Ore di posa da analisi prezzario CAM26_R02.090.070.C (0,55 h/m² per livello), maggiorate a 0,60 per il tracciamento su struttura."
      ],
      "da_verificare": [
        "2.1 — prezzo del pannello HPL stimato da listini: confermare con un preventivo del fornitore."
      ]
    }
  ]
}
```

Regole:

- `costo_unitario` è sempre valorizzato: il metodo non ammette `TBD`
  (`verifica` lo segnala come errore). Dove il costo è una stima della
  skill, `fonte` inizia con `stima — ` e dice su cosa si basa; la
  testata conta le stime e la riga va anche in `da_verificare`.
- `parametri` sono sempre 3 / 15 / 10 (`verifica` rifiuta altri valori);
  `fonte` resta `"metodo standard"`.
- Manodopera: `fonte` cita la tabella ANCE/ministeriale dell'anno
  (`references/manodopera_ance.md`), non il prezzario.
- `quantita` è sempre **per unità di misura della voce**; la conversione
  (kg/m², m/m²) sta nella descrizione o in `nota`.
- `n` segue la numerazione del foglio: `1.n` manodopera, `2.n`
  materiali, `3.n` mezzi d'opera, `4.n` varie.
- `sezioni.varie` può essere `[]`: il markdown scriverà «nessuna».
- `confronto` è assente se il prezzario non è disponibile o non c'è una
  voce analoga. Contiene il codice e il prezzo della voce analoga
  (`prezzo_prezzario`, da `dettaglio_analisi` o `confronta_prezzo`);
  scostamento e classificazione BASSO/MEDIO/ALTO li calcola lo script.
  `spiegazione` è obbligatoria quando lo scostamento supera il 15%
  (ALTO): la verifica fallisce senza.

## `analisi_nuovi_prezzi.md`

Testata, poi una sezione `## <codice> — <descrizione sintetica>` per
analisi, nell'ordine del computo. Lo script `rendi` la produce dal JSON
in questo formato esatto; scritta a mano, deve essere identica nella
struttura (il verificatore legge le righe in grassetto per confrontare i
totali con il ricalcolo).

```markdown
# Analisi dei nuovi prezzi — Computo metrico delle migliorie — liceo-rossi-efficientamento

**Prezzario:** Campania 2026 · **Parametri:** sicurezza 3% e spese generali 15% su totale A, utile 10% su totale B (metodo standard) · **Stadio:** bozza · **Generato:** 2026-11-08
**Documento di lavoro per il professionista: non va nella busta tecnica** (computo non estimativo: nessun prezzo di questo file compare negli altri documenti del computo).

> 1 costo stimato dalla skill (fonte «stima — …»), elencati in «Da verificare» di ciascuna analisi. Tutte le voci si intendono da verificare dal professionista.

## NP.OT.001 — Pareti divisorie in pannelli HPL compatto a nucleo pieno sp. 13 mm su struttura in alluminio

**U.M.:** m² · **Proposta:** Pareti divisorie dei servizi in HPL compatto · **Criterio:** 1.1 — Qualità dei materiali · **Voce di computo:** 29 — 9_CME_Computo_Metrico_Estimativo · **Voce analoga del prezzario:** CAM26_R02.090.070.C (95,10 €/m²)

**Descrizione estesa.** Fornitura e posa in opera di pareti divisorie per servizi igienici in pannelli di laminato HPL compatto a nucleo pieno, spessore 13 mm, classe di reazione al fuoco B-s2,d0, bordi arrotondati, su struttura portante in profili di alluminio anodizzato con piedini regolabili; comprese ferramenta in acciaio inox, serrature libero/occupato, tracciamento, tagli, sfridi, fissaggi, pulizia finale. Esclusa la demolizione delle pareti esistenti.

| N. | Descrizione | U.M. | Quantità | Costo unitario | Importo | Incidenza | Fonte |
|---|---|---|---|---|---|---|---|
| **1.** | **MANODOPERA** | | | | | | |
| 1.1 | Operaio specializzato (3° livello) | h | 0,600 | 34,97 | 20,98 | 12,41% | tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip. |
| 1.2 | Operaio qualificato (2° livello) | h | 0,600 | 32,37 | 19,42 | 11,49% | tabella ANCE Napoli n. 373 (dal 01/10/2026), oltre 15 dip. |
| | *Totale 1 — Manodopera* | | | | **40,40** | **23,89%** | |
| **2.** | **MATERIALI** | | | | | | |
| 2.1 | Pannello HPL compatto nucleo pieno sp. 13 mm, classe B-s2,d0, compreso sfrido 8% | m² | 1,080 | 62,00 | 66,96 | 39,60% | stima — listini produttori HPL compatto 13 mm (55–70 €/m²), nessuna voce elementare nel prezzario |
| 2.2 | Profili in alluminio anodizzato per struttura e fissaggio | m | 3,200 | 6,80 | 21,76 | 12,87% | prezzario Campania 2026 — CAM26_P01.010.040.B |
| | *Totale 2 — Materiali* | | | | **88,72** | **52,47%** | |
| **3.** | **MEZZI D'OPERA** | | | | | | |
| 3.1 | Attrezzatura minuta ed elettroutensili (nolo a freddo) | h | 0,600 | 1,90 | 1,14 | 0,67% | prezzario Campania 2026 — CAM26_N.01.020.010.A |
| | *Totale 3 — Mezzi d'opera* | | | | **1,14** | **0,67%** | |
| **4.** | **VARIE** | | | | | | |
| 4.1 | nessuna | | | | 0,00 | 0,00% | |
| | *Totale 4 — Varie* | | | | **0,00** | **0,00%** | |
| | **TOTALE A (1+2+3+4)** | | | | **130,26** | **77,04%** | |
| 5.0 | Incidenza sicurezza 3% su totale A | | | | 3,91 | 2,31% | |
| 5.1 | Spese generali 15% su totale A | | | | 19,54 | 11,56% | |
| | **TOTALE B (A + 5.0 + 5.1)** | | | | **153,71** | | |
| 6. | Utile d'impresa 10% su totale B | | | | 15,37 | 9,09% | |
| | **TOTALE GENERALE** | | | | **169,08** | **100,00%** | |
| | **PREZZO DI APPLICAZIONE** | €/m² | | | **169,08** | | |

**Incidenze:** manodopera 23,89% · materiali 52,47% · mezzi d'opera 0,67% · varie 0,00% · sicurezza 2,31% · spese generali 11,56% · utile 9,09%.
**Confronto con la voce analoga:** CAM26_R02.090.070.C, 95,10 €/m² → scostamento +77,79% (ALTO). Il pannello HPL a nucleo pieno costa circa il doppio del laminato della voce di prezzario; la posa è analoga.

**Note**
- Ore di posa da analisi prezzario CAM26_R02.090.070.C (0,55 h/m² per livello), maggiorate a 0,60 per il tracciamento su struttura.

**Da verificare**
- 2.1 — prezzo del pannello HPL stimato da listini: confermare con un preventivo del fornitore.
```

Convenzioni numeriche: virgola decimale, nessun separatore delle
migliaia; quantità a 3 decimali, importi e costi a 2, incidenze a 2 con
`%`. Nessuna casella vuota nelle colonne numeriche.

## `analisi_nuovi_prezzi.xlsx`

Generato da `scripts/analisi_np.py xlsx` (o `rendi`). Un foglio per
nuovo prezzo, nome del foglio = codice (`NP.OT.001`), stesso layout del
foglio di riferimento `assets/ANALISI_NUOVI_PREZZI_METODO.xls`: testata
con codice e descrizione, colonne `N. | Descrizione | Fonte | U.M. |
Quantità | Costo unitario | Importo parziale | Importo totale`, sezioni
1–4 con riga di totale e riga «incidenza», TOTALE A, 5.0, 5.1, TOTALE
B, 6., TOTALE GENERALE, PREZZO DI APPLICAZIONE. Importi e totali sono
**formule** Excel (non valori), così il professionista può correggere
una quantità e vedere il prezzo aggiornarsi — è il suo modo di lavorare,
e le sue correzioni sul foglio sono quelle da cui la skill impara. Un
foglio `Riepilogo` elenca tutti i nuovi prezzi con U.M., prezzo di
applicazione, incidenza manodopera e stato («completo» o «n stime da
verificare»).

## `memoria/analisi_approvate/<slug>.md`

Una per analisi approvata (stadio definitivo). Slug: codice + descrizione
sintetica normalizzata (`np-ot-001-pareti-divisorie-hpl-compatto`).
Frontmatter ricercabile con `grep`:

```markdown
---
codice: NP.OT.001
descrizione_sintetica: Pareti divisorie in pannelli HPL compatto a nucleo pieno sp. 13 mm su struttura in alluminio
tag: [pareti divisorie, HPL, laminato compatto, servizi igienici, struttura alluminio]
unita_misura: m²
prezzo_applicazione: 142.30
incidenze: { manodopera: 26.4, materiali: 58.9, mezzi_opera: 0.8, varie: 0.0 }
regione: Campania
anno_prezzario: 2026
gara: liceo-rossi-efficientamento
deliverable_id: C1-0
approvata_il: 2026-11-12
voce_prezzario_analoga: CAM26_R02.090.070.C
modificata_dal_professionista: true
---

<la sezione markdown dell'analisi, com'è nel file approvato>
```

`tag` li scegli tu: materiale, tipo di lavorazione, ambito, parole che
un'analisi futura cercherebbe. Meglio sei tag buoni che venti generici.

## `memoria/prezzi_appresi.json`

```json
{
  "schema": "prezzi-appresi/1.0",
  "voci": [
    {
      "chiave": "pannello hpl compatto nucleo pieno 13 mm",
      "descrizione": "Pannello HPL compatto nucleo pieno sp. 13 mm, classe B-s2,d0",
      "tipo": "materiali",
      "um": "m²",
      "prezzo": 68.00,
      "codice_prezzario": null,
      "regione": "Campania",
      "anno": 2026,
      "gara": "liceo-rossi-efficientamento",
      "data": "2026-11-12",
      "fonte": "correzione professionista (preventivo Abet Laminati)",
      "conferme": 1
    }
  ]
}
```

`chiave` è la descrizione normalizzata (minuscole, senza punteggiatura)
usata per riconoscere la stessa voce in gare diverse e aggiornare
`conferme` invece di duplicare. `tipo` è una delle quattro sezioni.

## `memoria/lezioni.md`

```markdown
# Lezioni — analisi nuovi prezzi

Regole ricavate dalle correzioni del professionista. Una riga per
lezione; stessa regola → aggiorna «confermata n×», non duplicare.
Oltre ~60 righe: consolidare (SKILL.md, «Apprendimento»).

## Manodopera
- [2026-11-12 · gara liceo-rossi · bozza→modifica a mano] **Pareti prefabbricate su struttura**: ore portate da 0,35 a 0,60 h/m² per livello («serve il tracciamento»). Regola: per pannellature su struttura stimare ≥0,5 h/m² per livello. (confermata 1×)

## Materiali
## Mezzi d'opera
## Varie
## Percentuali e parametri
## Descrizioni e forma
## In attesa di rifinitura
```

Le sezioni sono fisse; una lezione va nella sezione della componente
che corregge. «Percentuali e parametri» raccoglie le eccezioni per
stazione appaltante; «Descrizioni e forma» il modo in cui il
professionista vuole scritte descrizioni, note e fonti. «In attesa di
rifinitura» è dove `analisi_np.py apprendi` accoda le candidate (con
segnaposto fra parentesi quadre): la skill le rifinisce e le sposta;
finché stanno lì non sono regole e non si applicano.
