# EG Delivery Print Link

Novo aplicativo Windows local para vincular a loja com e-mail, senha e token, buscar jobs do EG Delivery e imprimir pedidos automaticamente.

## Desenvolvimento

```powershell
npm install
npm start
```

Para rodar apenas o agente em terminal:

```powershell
npm run agent
```

Para listar impressoras:

```powershell
npm run printers
```

## Configuracao

O app procura a configuracao da loja em:

- `%APPDATA%\EG Delivery Print Link\config.json`
- `%LOCALAPPDATA%\EG Delivery Print Link\config.json`
- `config.json` ao lado do executavel
- `config.json` no diretorio atual

Exemplo:

```json
{
  "api": "https://sua-api.com/api",
  "token": "token-da-loja",
  "printer_name": "",
  "poll_ms": 5000,
  "agent_id": "loja-print-agent"
}
```

## Gerar executavel

```powershell
npm install
npm run dist
```

O executavel portatil sai em:

```text
print-agent/dist/EG Delivery Print Link 2.0.1.exe
```

Depois disso, o endpoint do painel baixa esse `.exe` direto para a loja, sem instalador.
