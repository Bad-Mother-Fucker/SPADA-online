# Command — Run Strategy Audit

Usa agente: `.claude/agents/strategy-auditor`
Usa skill: `.claude/skills/strategy-audit/SKILL.md`

## Trigger

"esegui audit strategico", "run strategy audit",
"analisi strategica", "audit prezzi", "verifica budget sicurezza",
"rigenera audit", "aggiorna strategy audit"

## Prerequisito

`02_graph/index.md` deve esistere.
Se non esiste: "Il knowledge graph non e' stato costruito.
Avvia prima l'analisi preliminare completa."

`02_graph/economic_framework.md` deve esistere.
Se non esiste: avvisa ma procedi — strategy-auditor gestira'
i TBD nelle singole analisi.

## Comportamento

Attiva `strategy-auditor` che esegue le quattro analisi dalla skill
e produce `output/03_criteria/strategy_audit.md`.

Se `strategy_audit.md` esiste gia': lo sovrascrive (run successivi
aggiornano l'audit — es. dopo aggiornamento del knowledge graph).

Al termine presenta:
```
Audit strategico completato.

| Analisi          | Classificazione | Alert |
|------------------|-----------------|-------|
| Budget sicurezza | [classe]        | [—/testo] |
| Gap prezzi       | [classe]        | [—/testo] |
| Viabilita'       | [classe]        | [—/testo] |

Report completo: output/03_criteria/strategy_audit.md
```
