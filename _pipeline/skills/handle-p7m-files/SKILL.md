---
name: handle-p7m-files
description: Usa quando incontri file .p7m firmati digitalmente in input/ e devi estrarne il contenuto analizzabile. Conserva sempre l'originale ed estrae in output/01_extracted/p7m_extracted/.
---

# Skill — Gestione file .p7m

## Scopo

Gestire file firmati digitalmente `.p7m` conservando sempre l'originale ed estraendo il contenuto analizzabile.

## Procedura

1. Identificare i file `.p7m` in `input/p7m/`
2. Tentare l'estrazione del contenuto (vedi `extraction_commands.md`)
3. Salvare il file estratto in `output/01_extracted/p7m_extracted/`
4. Registrare l'operazione in `output/01_extracted/extraction_log.md`
5. Aggiornare `input/_manifest_input.md` con lo stato di estrazione
6. Se l'estrazione fallisce, registrare errore e motivo nel log

## Regole

1. Conservare sempre il file originale `.p7m` in `input/p7m/`
2. Non alterare mai il file originale
3. Non sovrascrivere mai il file originale con il file estratto
4. Non inventare contenuti non estraibili
5. Associare sempre originale ed estratto tramite ID documento
6. Se il file estratto è a sua volta un PDF, tentare successivamente l'estrazione del testo

## Output

- File estratto in `output/01_extracted/p7m_extracted/Dxxx_nomefile.ext`
- Versione `.md` del testo in `output/01_extracted/text/Dxxx_nomefile.md` (se possibile)
- Aggiornamento `output/01_extracted/extraction_log.md`
- Aggiornamento `input/_manifest_input.md`
