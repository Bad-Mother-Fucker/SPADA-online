# memoria/ — ciò che la skill ha imparato su questa macchina

Questa cartella è **per macchina, non per gara e non versionata**
(`.gitignore` della skill): è l'equivalente di `_data/` per la
conoscenza che la skill accumula dalle correzioni del professionista.
Se è vuota, la skill parte dal solo metodo (`references/`).

| File | Chi lo scrive | Cosa contiene |
|---|---|---|
| `lezioni.md` | `analisi_np.py apprendi` (candidate) → la skill le rifinisce | regole generalizzate, con data, gara, perché e contatore di conferme |
| `prezzi_appresi.json` | `analisi_np.py apprendi` | costi orari, prezzi di materiali e noli corretti o confermati dal professionista, con regione, anno, data, fonte |
| `analisi_approvate/*.md` | `analisi_np.py apprendi --archivia` | ogni analisi approvata allo stadio definitivo, con frontmatter ricercabile (`grep -il "<parola>" analisi_approvate/*.md`) |

## Igiene

- Si impara **solo** da ciò che il professionista ha cambiato o approvato,
  mai dall'output non corretto della skill.
- Una riga in «In attesa di rifinitura» non è una regola finché non ha
  il suo perché e non è stata spostata nella sezione della componente.
- `python3 ../scripts/analisi_np.py memoria stato` mostra lo stato:
  lezioni per sezione, candidate alla promozione (confermate ≥3×),
  prezzi più vecchi di 12 mesi, range delle incidenze osservate.
- Oltre ~60 lezioni: consolidare. Le regole confermate più volte si
  promuovono in `references/metodo.md` («Regole consolidate») e si
  committano con la pipeline: è così che l'apprendimento di una
  macchina arriva alle altre. Lo decide chi mantiene la pipeline, non
  la skill.
- Per portare la memoria su un'altra macchina: copia la cartella.
  Per azzerarla: cancella tutto tranne questo README e `.gitkeep`.
