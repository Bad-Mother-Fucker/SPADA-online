' Ferma SPADA.vbs - spegne SPADA con doppio clic (Windows + WSL).
'
' Se una fase sta lavorando chiede conferma: fermarla adesso la
' interrompe e andra' rilanciata dall'app.

Option Explicit

' Argomenti separati con --exec: vedi Avvia SPADA.vbs.
Const WSL = "wsl.exe -d Ubuntu --cd ~ --exec bash -l SPADA-online/spada "

Dim sh, risposta
Set sh = CreateObject("WScript.Shell")

' "spada in-corso" esce 0 se c'e' una fase in coda o in esecuzione.
If sh.Run(WSL & "in-corso", 0, True) = 0 Then
  risposta = MsgBox("Prometheus - S.P.A.D.A. sta lavorando a una fase." & vbCrLf & vbCrLf & _
                    "Se lo chiudi adesso la fase si interrompe e dovrai rilanciarla dall'app." & vbCrLf & _
                    "Chiudere comunque?", vbYesNo + vbExclamation + vbDefaultButton2, "Prometheus - S.P.A.D.A.")
  If risposta <> vbYes Then WScript.Quit 0
End If

sh.Run WSL & "ferma", 0, True
MsgBox "Prometheus - S.P.A.D.A. e' stato chiuso.", vbInformation, "Prometheus - S.P.A.D.A."
