---
name: criterion-output-audit
description: Usa quando devi auditare le proposte di un criterio prima che entrino nei registri: verifica evidenza documentale, coerenza con il disciplinare, perimetro di progetto e sostenibilita' economica. Produce l'audit in formato tabella con stato e motivazione.
---

# Skill — Audit output criterio

## Scopo

Verificare che ogni proposta sia coerente con il disciplinare, abbia evidenza documentale sufficiente e rispetti i limiti di gara. Produce audit sintetico in formato tabella.

## Sequenza verifiche

Per ogni proposta controllare:

1. **Evidenza documentale** — la proposta ha evidenza forte, sufficiente, debole o assente?
2. **Coerenza con criterio** — la proposta risponde al criterio e al subcriterio dichiarati?
3. **Rischio fuori scope** — la proposta modifica sostanzialmente il progetto o introduce varianti non ammesse?
4. **Compatibilità tecnica** — la proposta è realizzabile con le tecnologie e i vincoli del progetto?
5. **Compatibilità economica** — la proposta è sostenibile economicamente nel quadro di gara?
6. **Compatibilità temporale** — la proposta è realizzabile nei tempi contrattuali?
7. **Misurabilità** — il beneficio valutativo è misurabile e verificabile dalla commissione?
8. **Allineamento punteggio** — la proposta può generare punteggio sul criterio/subcriterio dichiarato?

## Formato audit

```
| ID Proposta | Evidenza | Coerenza | Rischio | Stato |
|---|---|---|---|---|
| P-C1-001 | forte | sì | basso | approvata |
| P-C1-002 | debole | parziale | medio | da integrare |
```

## Stati

| Stato | Significato | Azione |
|---|---|---|
| `approvata` | Tutte le verifiche positive | Entra nel registro proposte |
| `approvata con riserva` | Verifiche positive ma con nota di attenzione | Entra nel registro con nota |
| `da integrare` | Mancano informazioni, diventa domanda guida | Non entra nel registro, va in `07_questions/` |
| `scartata` | Evidenza assente o contraddice il disciplinare | Non entra nel registro, archiviata con motivo |

## Regole

- Evidenza assente → sempre `scartata`
- Evidenza debole → almeno `da integrare`
- Contraddice disciplinare → sempre `scartata`
- Rischio fuori scope alto senza evidenza → `scartata`
- Solo `approvata` e `approvata con riserva` entrano in `proposal_register.md`
