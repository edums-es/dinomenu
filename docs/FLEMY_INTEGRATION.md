# Integracao Flemy CRM

O Dino Menu mantem a Evolution API como canal basico e fallback do plano Start.
A Flemy atua como camada Business/Plus para CRM, automacao, Agente IA e atendimento humano.

## Arquitetura

```txt
Pedido/status/pagamento no Dino Menu
  -> Receber Webhook da Flemy
  -> Flow decide mensagem, tag, funil, fila ou atendimento

Mensagem do cliente no WhatsApp conectado a Flemy
  -> Agente IA
  -> Tool HTTP segura do Dino Menu
  -> consulta pedido/cardapio/ofertas ou cancela pedido

Notificacao de status
  -> Push autenticado Flemy
  -> se falhar, Evolution API envia como fallback
```

## 1. Eventos Dino Menu para o Flow

Na Flemy, crie um Flow com o gatilho `Receber Webhook` e salve uma vez para gerar
a URL publica. No Dino Menu, abra `Gestao > WhatsApp > Flemy CRM / Automacao Plus`,
cole a URL e habilite os eventos desejados:

- `order.created`
- `order.status_changed`
- `order.cancelled`
- `payment.pending`
- `payment.paid`

O corpo recebido fica disponivel na Flemy em `variables.payload`. Exemplos:

```txt
{{payload.event}}
{{payload.order.number}}
{{payload.order.status}}
{{payload.order.customer.phone}}
{{payload.order.tracking_url}}
```

Use um bloco `Script JS` ou `Variavel` logo depois do gatilho para extrair os
campos mais usados. Depois, use `Condicao`, `Conteudo`, `Acao` e `Enviar Webhook`
para montar cada automacao.

Cada POST possui `event_id`, `event`, `occurred_at`, `restaurant`, `order` e
`data`. O header `X-Dino-Signature` contem HMAC SHA-256 quando um segredo foi
configurado. A assinatura e util quando o webhook passa por um relay que consiga
valida-la; o Flow da Flemy pode receber o evento normalmente sem essa validacao.

## 2. Agente IA consultando o Dino Menu

O painel exibe o endpoint POST e o token de cada restaurante. A Tool HTTP do
Agente IA da Flemy suporta autenticacao Bearer, parametros escolhidos pelo modelo
e corpo JSON com templates.

Configuracao base:

```txt
Metodo: POST
URL: endpoint exibido no Dino Menu
Auth: Bearer
Token: token exibido no Dino Menu
Body type: JSON
Args location: none
```

Crie tools separadas, com nomes e descricoes claras:

```json
{
  "action": "get_order_status",
  "phone": "{{contact.number}}",
  "order_number": "{{args.order_number}}"
}
```

```json
{
  "action": "cancel_order",
  "phone": "{{contact.number}}",
  "order_number": "{{args.order_number}}",
  "reason": "{{args.reason}}"
}
```

Outras acoes:

```json
{"action":"get_menu"}
{"action":"get_offers"}
{"action":"get_restaurant_info"}
{"action":"get_customer_orders","phone":"{{contact.number}}"}
```

O cancelamento automatico exige telefone e pedido, e so e permitido nos status
`pending` e `accepted`. Depois disso, o Agente IA deve usar `transfer_human`.

Prompt recomendado:

```txt
Nunca invente status, valores, cupons ou disponibilidade.
Use as tools antes de responder sobre pedido, cardapio ou oferta.
Confirme telefone e numero do pedido antes de cancelar.
Se o cancelamento for recusado, o cliente pedir atendente ou houver duvida,
transfira para atendimento humano.
```

## 3. Push autenticado Flemy

Na Flemy, abra `Configuracoes > API/Webhook > Adicionar`, escolha o canal e copie
a `Url ou endpoint autenticado`. Cole no campo `URL autenticada do Push` no Dino
Menu.

O Dino Menu envia o formato oficial exigido pela Flemy:

```json
{
  "number": "5527999991234",
  "body": "Mensagem para o cliente",
  "externalKey": "order:uuid:status:preparing",
  "chatbotId": "opcional",
  "queueId": "opcional",
  "userId": "opcional",
  "forceTicketToDepartment": true,
  "forceTicketToUser": true
}
```

Ative `Notificar status pelo CRM` para enviar atualizacoes por esse Push. Caso a
Flemy esteja indisponivel ou rejeite a requisicao, o Dino Menu usa a Evolution
API automaticamente para nao deixar o cliente sem notificacao.

## Flow recomendado

1. `Inicio` recebe a mensagem do cliente.
2. `Agente IA` identifica cardapio, oferta, status, cancelamento ou humano.
3. Tools HTTP consultam o Dino Menu em tempo real.
4. `Acao` adiciona tags e atualiza dados do contato.
5. `transfer_human` ou `transferQueue` entrega casos sensiveis a equipe.
6. `closeTicket` encerra apenas quando a solicitacao estiver resolvida.

Para eventos de pedido, use outro Flow iniciado por `Receber Webhook`. A Flemy
documenta esse gatilho como headless: ele recebe `variables.payload`, mas nao
possui contato/ticket automaticamente. Para mensagens transacionais, prefira o
Push autenticado, que localiza o contato pelo numero e cria ou movimenta o ticket.
