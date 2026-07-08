# EG Delivery Impressora

Agente Windows dedicado a impressao automatica de pedidos.

## Fluxo

1. O dono ativa a impressao e gera um token no painel.
2. No aplicativo, informa e-mail, senha e token.
3. O aplicativo salva uma credencial exclusiva do computador protegida pelo Windows.
4. Pedidos ficam em uma fila persistente no servidor.
5. O aplicativo envia o recibo em ESC/POS para a impressora selecionada e confirma a tarefa.

## Desenvolvimento

O aplicativo usa apenas a biblioteca padrao do Python em execucao. O PyInstaller e
necessario somente para gerar o executavel:

```powershell
.\build.ps1
```

O resultado e um unico arquivo em `dist/EG-Delivery-Print-Agent.exe`.
