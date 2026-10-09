#!/bin/bash
# installa.sh — mette sul Desktop di Windows le icone «Avvia Prometheus - S.P.A.D.A.» e
# «Ferma Prometheus - S.P.A.D.A.» (da WSL). Da rieseguire se si spostano i file .vbs.
#
# I .vbs si copiano in C:\Users\<utente>\SPADA: eseguiti da un percorso
# \\wsl.localhost Windows mostrerebbe un avviso di sicurezza a ogni clic.
#
# Uso: bash windows/installa.sh

set -euo pipefail

QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v powershell.exe >/dev/null 2>&1 || { echo "✗ powershell.exe non trovato: serve WSL su Windows." >&2; exit 1; }

ps() { powershell.exe -NoProfile -NonInteractive -Command "$1" | tr -d '\r'; }

PROFILO_WIN="$(ps '[Environment]::GetFolderPath("UserProfile")')"
DESKTOP_WIN="$(ps '[Environment]::GetFolderPath("Desktop")')"
DEST_WIN="$PROFILO_WIN\\SPADA"
DEST="$(wslpath "$DEST_WIN")"

mkdir -p "$DEST"
for f in "Avvia SPADA.vbs" "Ferma SPADA.vbs"; do
  # Fine riga Windows: Windows Script Host li legge comunque, ma così si
  # aprono bene anche nel Blocco note.
  sed 's/\r\{0,1\}$/\r/' "$QUI/$f" > "$DEST/$f"
done
echo "▶ Lanciatori copiati in $DEST_WIN"

# Icone generate da app/web/dev/icone.mjs (spada del prodotto, arresto).
cp "$QUI/avvia.ico" "$QUI/ferma.ico" "$DEST/"

# Collegamenti sul Desktop: wscript.exe esegue il .vbs senza console.
crea_collegamento() {
  local nome="$1" vbs="$2" icona="$3"
  ps "\$s = (New-Object -ComObject WScript.Shell).CreateShortcut('$DESKTOP_WIN\\$nome.lnk');
      \$s.TargetPath = \"\$env:WINDIR\\System32\\wscript.exe\";
      \$s.Arguments = '\"$DEST_WIN\\$vbs\"';
      \$s.WorkingDirectory = '$DEST_WIN';
      \$s.IconLocation = '$icona';
      \$s.Description = '$nome';
      \$s.Save()"
  echo "▶ Icona sul Desktop: $nome"
}
# Icone col vecchio nome (prima del nome «Prometheus - S.P.A.D.A.»).
rm -f "$(wslpath "$DESKTOP_WIN")/Avvia SPADA.lnk" "$(wslpath "$DESKTOP_WIN")/Ferma SPADA.lnk"
crea_collegamento "Avvia Prometheus - S.P.A.D.A." "Avvia SPADA.vbs" "$DEST_WIN\\avvia.ico"
crea_collegamento "Ferma Prometheus - S.P.A.D.A." "Ferma SPADA.vbs" "$DEST_WIN\\ferma.ico"
