' Avvia SPADA.vbs - lanciatore con doppio clic per Windows (WSL).
'
' Avvia server e worker dentro Ubuntu (WSL) senza finestre nere e apre
' http://localhost:8000 nel browser. Se SPADA e' gia' attivo, apre solo
' il browser. Va bene cliccarlo anche piu' volte.
'
' Installato da windows/installa.sh: copia in C:\Users\<utente>\SPADA e
' icona sul Desktop.

Option Explicit

' Argomenti separati con --exec, niente "bash -c" fra virgolette: wsl.exe
' spezza a modo suo le stringhe quotate. --cd ~ = home dell'utente Ubuntu.
Const WSL = "wsl.exe -d Ubuntu --cd ~ --exec bash -l SPADA-online/spada "

Dim sh, rc
Set sh = CreateObject("WScript.Shell")

' 0 = nessuna finestra, True = aspetta la fine. "spada apri" aspetta da
' solo che il server risponda, poi apre il browser.
' Se Windows non riesce nemmeno a lanciare wsl.exe, messaggio comprensibile
' invece dell'errore tecnico di Windows Script Host.
On Error Resume Next
rc = sh.Run(WSL & "apri", 0, True)
If Err.Number <> 0 Then rc = -1
On Error GoTo 0

If rc <> 0 Then
  MsgBox "Prometheus - S.P.A.D.A. non si e' avviato." & vbCrLf & vbCrLf & _
         "Riprova tra qualche secondo. Se il problema continua, chiedi assistenza " & _
         "indicando il file di dettaglio:" & vbCrLf & _
         "Ubuntu: ~/spada/_log/lanciatore.log", vbExclamation, "Prometheus - S.P.A.D.A."
  WScript.Quit 1
End If

' Tiene accesa Ubuntu finche' SPADA e' attivo: senza, Windows la spegne
' pochi secondi dopo e con lei il server. Non aspetta (False).
sh.Run WSL & "mantieni", 0, False
