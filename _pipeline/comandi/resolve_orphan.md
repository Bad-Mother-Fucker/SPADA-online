---
argument-hint: <codice elaborato> <criteri> <motivazione>
description: Collega un documento orfano a uno o piu' criteri nel knowledge graph.
---

# Command — Resolve Orphan

## Argomento

Input del professionista: `$ARGUMENTS`

Atteso: codice elaborato, criteri di destinazione, motivazione.
Se `$ARGUMENTS` e' vuoto o incompleto (in particolare se manca la
motivazione), chiedi i dati mancanti prima di procedere.

Usa skill: `.claude/skills/graph-lint/SKILL.md` (per verifica post-risoluzione)

## Trigger

"collega [codice] a [Cx]", "risolvi orfano [codice]",
"link [codice] a C[x] e C[y]", "collega orfano"

## Prerequisito

`02_graph/index.md` deve esistere con la sezione Orfani popolata.
Il documento indicato deve avere una pagina nodo in `02_graph/nodes/`.

## Input attesi dal professionista

Il professionista deve indicare:
- Il codice del documento orfano (es. `08.Q.R03_Quadro_Manodopera`)
- Il o i criteri a cui collegarlo (es. `C1`, `C2`)
- La motivazione del collegamento (es. "contiene i prezzi unitari
  di riferimento per le lavorazioni del criterio")

Se manca la motivazione: chiedi prima di procedere.

## Procedura

1. Leggi `02_graph/nodes/[codice].md`.
2. Aggiungi al frontmatter esistente le voci mancanti in
   `supports_criteria`:
   ```yaml
   supports_criteria:
     - { criterion: "[[C1]]", priority: media, reason: "[motivazione del professionista]" }
   ```
   Usa `priority: media` come default — il professionista puo'
   specificare alta o bassa nella motivazione.
3. Aggiorna il campo `graph_updated` nella pagina criterio
   `03_criteria/criteria/criterion_Cx.md`: aggiungi il documento appena
   collegato alla lista `supported_by`.
4. Esegui `graph-lint` (`.claude/skills/graph-lint/SKILL.md`)
   per verificare che il documento non sia piu' nella lista orfani.
5. Rimuovi il documento dalla sezione Orfani di `02_graph/index.md`.
6. Appendi a `02_graph/log.md`:
   ```
   ## [YYYY-MM-DD] resolve-orphan | [codice] → [[C1]], [[C2]] | motivo: [testo]
   ```

## Report

```
Orfano risolto: [codice]
Collegato a: [lista criteri]
Motivazione: [testo]
Verifica lint: [orfani residui N]
```
