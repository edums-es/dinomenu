# Dino Menu Impressora

Aplicativo Windows local para imprimir pedidos automaticamente quando o Dino Menu cria jobs de impressao.

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

- `%APPDATA%\Dino Menu Impressora\config.json`
- `config.egdelivery.json` ao lado do instalador/executavel
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

## Gerar instalador

```powershell
npm install
npm run dist
```

O instalador sai em:

```text
print-agent/dist/Dino Menu Impressora Setup.exe
```

Depois disso, o endpoint do painel consegue incluir esse `.exe` no pacote baixado pela loja.
