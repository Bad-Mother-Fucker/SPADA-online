# Comandi per gestione file .p7m

## Identificare file .p7m

```bash
find 00_input/p7m -name "*.p7m"
```

## Tentativo estrazione con openssl (formato CMS/PKCS7)

```bash
openssl cms -verify -inform DER -in input.pdf.p7m -noverify -out output.pdf 2>/dev/null
```

## Alternativa: formato SMIME

```bash
openssl smime -verify -inform DER -in input.pdf.p7m -noverify -out output.pdf 2>/dev/null
```

## Verifica tipo file estratto

```bash
file output.pdf
```

## Estrazione testo da PDF estratto (se pdftotext disponibile)

```bash
pdftotext output.pdf output.txt
```

## Conversione in .md (manuale o con pandoc se disponibile)

```bash
pandoc output.txt -o output.md
```

## Note operative

- I comandi sono indicativi e dipendono dagli strumenti disponibili nel sistema.
- Non sovrascrivere mai il file originale `.p7m`.
- Se openssl non è disponibile, cercare alternative nel sistema (es. p7m tools).
- Registrare sempre l'esito nel log, anche in caso di fallimento.
- In caso di fallimento, indicare nel manifest che il file richiede elaborazione manuale.
