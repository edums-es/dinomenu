# Integracao Flemy CRM

O Dino Menu mantem a Evolution API para notificacoes basicas do plano Start.
A Flemy atua como camada premium de CRM, automacao e agente inteligente.

## Configuracao

1. Na Flemy, crie um fluxo com o gatilho `Receber Webhook` e salve para gerar a URL publica.
2. No Dino Menu, abra `Gestao > WhatsApp > Flemy CRM / Automacao Plus`.
3. Cole a URL, defina um segredo, habilite os eventos e salve.
4. Use `Testar` para confirmar que o fluxo recebe eventos.

## Eventos Dino Menu para Flemy

- `order.created`
- `order.status_changed`
- `order.cancelled`
- `payment.pending`
- `payment.paid`

Cada POST possui `event_id`, `event`, `occurred_at`, `restaurant`, `order` e `data`.
Quando um segredo esta configurado, o header `X-Dino-Signature` contem:

```txt
sha256=HMAC_SHA256(segredo, corpo_json_bruto)
```

## Ferramentas Flemy para Dino Menu

No bloco API ou como tool HTTP do Agente IA:

- Metodo: `POST`
- URL: exibida no painel do Dino Menu
- Header: `X-Flemy-Token`, exibido no painel
- Body JSON: uma das acoes abaixo

Consultar pedidos/status:

```json
{"action":"get_order_status","phone":"27999991234","order_number":42}
```

Cancelar pedido:

```json
{"action":"cancel_order","phone":"27999991234","order_number":42,"reason":"Solicitado pelo cliente"}
```

O cancelamento automatico somente e permitido nos status `pending` e `accepted`.
Depois disso, a Flemy deve transferir para atendimento humano.

Outras acoes:

```json
{"action":"get_menu"}
{"action":"get_offers"}
{"action":"get_restaurant_info"}
{"action":"get_customer_orders","phone":"27999991234"}
```

## Fluxo recomendado do Agente IA

1. Identificar intencao: cardapio, oferta, status, cancelamento ou humano.
2. Confirmar telefone e numero do pedido antes de consultar/cancelar.
3. Usar a ferramenta correspondente.
4. Para cancelamento recusado ou assunto sensivel, transferir para humano.
5. Nunca inventar status, valores, cupons ou disponibilidade; sempre consultar a ferramenta.
