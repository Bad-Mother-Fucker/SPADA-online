# Schema log estrazione .p7m

## extraction_log.md — Schema voce

```markdown
## Estrazione [codice] — nomefile.pdf.p7m

- **Data:** YYYY-MM-DD
- **File originale:** input/p7m/nomefile.pdf.p7m
- **Comando usato:** openssl cms ...
- **Esito:** successo / fallimento parziale / fallimento totale
- **File estratto:** output/01_extracted/p7m_extracted/[codice]_nomefile.pdf
- **Versione .md:** output/01_extracted/text/[codice]_nomefile.md (se disponibile)
- **Note:** eventuali problemi, pagine mancanti, qualità OCR, ecc.
```

## _manifest_input.md — Colonna stato estrazione

| Codice | File | Tipo | Stato estrazione | File estratto |
|---|---|---|---|---|
| 08.Q.R02 | 08.Q.R02_Computo_Metrico.pdf.p7m | computo_metrico | estratto | 08.Q.R02_Computo_Metrico.pdf |
| 04.S.T01 | 04.S.T01_Pianta.pdf.p7m | tavola | fallito — elaborazione manuale | — |
