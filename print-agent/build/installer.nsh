!macro customInit
  nsExec::ExecToLog 'taskkill /IM "EG Delivery Impressora.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "Dino Menu Impressora.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "EG Delivery.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "eg-delivery-print-agent.exe" /F'
!macroend
