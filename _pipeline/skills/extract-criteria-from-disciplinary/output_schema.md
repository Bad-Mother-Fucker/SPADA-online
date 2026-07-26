# Schema output — Estrazione criteri

## criteria_matrix.md

```markdown
# Matrice Criteri — [Nome Gara]

| ID | Criterio | Punteggio max | Subcriteri | Metodo attribuzione | Note |
|---|---|---|---|---|---|
| C1 | ... | xx | ... | lineare / tabellare / disc. | ... |
```

## criterion_Cx.md

```markdown
# Criterio Cx — [Titolo criterio]

## Punteggio massimo
xx punti

## Subcriteri
| ID sub | Descrizione | Punti |
|---|---|---|
| C1.1 | ... | xx |

## Elementi premianti
- ...

## Vincoli espliciti
- ...

## Vincoli impliciti
- ...

## Documenti richiesti
- ...

## Rischi fuori scope
- ...

## Checklist operativa
- [ ] ...
- [ ] ...
```

## criteria_matrix.json

```json
{
  "criteria": [
    {
      "id": "C1",
      "title": "",
      "max_score": 0,
      "subcriteria": [],
      "scoring_method": "",
      "constraints": [],
      "out_of_scope_risks": []
    }
  ]
}
```
