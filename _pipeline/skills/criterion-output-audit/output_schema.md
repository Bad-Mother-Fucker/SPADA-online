# Schema output — Audit output criterio

## Sezione audit in Cx_output.md

Va nella sezione **7. Audit** del file (struttura CLAUDE.md §4.6).
Oltre alla tabella, compila la riga `**Audit:**` nella scheda di ogni
proposta (sezione 4) con stato e motivazione sintetica.

```markdown
## 7. Audit

| ID Proposta | Titolo | Evidenza | Coerenza | Rischio | Stato |
|---|---|---|---|---|---|
| P-C1-001 | Titolo breve | forte | sì | basso | approvata |
| P-C1-002 | Titolo breve | sufficiente | parziale | medio | approvata con riserva |
| P-C1-003 | Titolo breve | debole | sì | basso | da integrare |
| P-C1-004 | Titolo breve | assente | no | alto | scartata |

### Dettaglio proposte approvate con riserva

**P-C1-002** — Nota: [specificare riserva]

### Dettaglio proposte da integrare

**P-C1-003** — Domanda guida generata: Q-C1-003

### Dettaglio proposte scartate

**P-C1-004** — Motivo scarto: [specificare motivo]
```

## Aggiornamento audit_summary.md

```markdown
## Criterio Cx — [data analisi]

| Totale proposte | Approvate | Con riserva | Da integrare | Scartate |
|---|---|---|---|---|
| N | N | N | N | N |
```
