---
name: extract-criteria-from-disciplinary
description: Usa quando devi estrarre criteri, sottocriteri, punteggi, vincoli ed elementi premianti dal disciplinare di gara (Fase 1 Step 2). Assegna gli ID C1, C2, ... nell'ordine reale del disciplinare.
---

# Skill — Estrazione criteri dal disciplinare

## Scopo

Estrarre con precisione criteri valutativi, subcriteri, punteggi, vincoli e modalità di attribuzione punteggio dal disciplinare di gara.

## Procedura

1. Individua la sezione relativa all'offerta tecnica (spesso denominata: "Criteri di valutazione dell'offerta tecnica", "Tabella criteri", "Allegato criteri").
2. Estrai tutti i criteri valutativi presenti.
3. Assegna ID stabile: C1, C2, C3... (numero dinamico, uguale al numero reale di criteri).
4. Per ogni criterio estrai:
   - Titolo
   - Punteggio massimo
   - Subcriteri con punteggi parziali
   - Formula o metodo di attribuzione punteggio (lineare, tabellare, discrezionale)
   - Elementi premianti (cosa aumenta il punteggio)
   - Vincoli espliciti (scritti nel disciplinare)
   - Vincoli impliciti (desumibili da requisiti tecnici minimi)
   - Limiti dimensionali o formali (es. numero pagine)
   - Documenti richiesti dalla stazione appaltante
   - Rischi di fuori scope
5. Crea matrice criteri in formato tabella.
6. Crea checklist operativa per ogni criterio.
7. Crea un file criterio dedicato per ogni Cx.

## Output

- `output/03_criteria/criteria_matrix.md`
- `output/03_criteria/criteria_matrix.json`
- `output/03_criteria/criteria_checklist.md`
- `output/03_criteria/criteria/criterion_Cx.md` (uno per criterio)

## Regole

- Non inventare criteri non presenti nel disciplinare
- Non sintetizzare eccessivamente i vincoli (perdere un vincolo è grave)
- Non perdere punteggi parziali
- Non trasformare prescrizioni obbligatorie in suggerimenti
- Se una sezione del disciplinare è ambigua, segnalarla nella matrice con nota
