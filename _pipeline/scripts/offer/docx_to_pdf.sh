#!/bin/bash
# docx_to_pdf.sh <input.docx> <output.pdf> — converte un DOCX in PDF con
# quello che c'è sulla macchina: LibreOffice (Linux, macOS), oppure, in
# WSL, Microsoft Word di Windows via PowerShell. Esce con 2 se non trova
# nessun convertitore, con un messaggio da mostrare all'utente.
set -euo pipefail
IN="$(readlink -f "$1")"; OUT="$(readlink -m "$2")"
mkdir -p "$(dirname "$OUT")"

SOFFICE="$(command -v soffice || command -v libreoffice || true)"
[ -z "$SOFFICE" ] && [ -x "/Applications/LibreOffice.app/Contents/MacOS/soffice" ] && SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
if [ -n "$SOFFICE" ]; then
  TMP="$(mktemp -d)"
  "$SOFFICE" --headless --convert-to pdf --outdir "$TMP" "$IN" >/dev/null 2>&1
  mv "$TMP/$(basename "${IN%.*}").pdf" "$OUT"; rmdir "$TMP"
  exit 0
fi

if command -v powershell.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1; then
  # Word lavora su percorsi Windows: si passa da una cartella temporanea
  # di Windows, perché \\wsl$ non è sempre scrivibile da Word.
  WTMP_W="$(powershell.exe -NoProfile -Command '[System.IO.Path]::GetTempPath()' | tr -d '\r')"
  WTMP="$(wslpath -u "$WTMP_W")"
  NOME="spada_$$_$(date +%s)"
  cp "$IN" "$WTMP/$NOME.docx"
  powershell.exe -NoProfile -Command "
    \$ErrorActionPreference = 'Stop'
    \$w = New-Object -ComObject Word.Application
    \$w.Visible = \$false
    try {
      \$d = \$w.Documents.Open('${WTMP_W}${NOME}.docx', \$false, \$true)
      \$d.SaveAs2('${WTMP_W}${NOME}.pdf', 17)
      \$d.Close(\$false)
    } finally { \$w.Quit() }" >/dev/null 2>&1 || { rm -f "$WTMP/$NOME.docx"; echo "Conversione in PDF con Word non riuscita." >&2; exit 1; }
  mv "$WTMP/$NOME.pdf" "$OUT"; rm -f "$WTMP/$NOME.docx"
  exit 0
fi

echo "Nessun convertitore PDF disponibile: installa LibreOffice (es. sudo apt install libreoffice-writer) oppure scarica il DOCX e salvalo in PDF da Word." >&2
exit 2
