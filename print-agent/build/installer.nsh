!macro customInit
  nsExec::ExecToLog 'taskkill /IM "EG Delivery Print Link.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "EG Delivery Impressora.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "Dino Menu Impressora.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "EG Delivery.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "eg-delivery-print-agent.exe" /F'
  Sleep 1200
  RMDir /r "$LOCALAPPDATA\Programs\EG Delivery Print Link"
  RMDir /r "$LOCALAPPDATA\Programs\EG Delivery Impressora"
  RMDir /r "$LOCALAPPDATA\Programs\Dino Menu Impressora"
  RMDir /r "$LOCALAPPDATA\Programs\EG Delivery"
!macroend
