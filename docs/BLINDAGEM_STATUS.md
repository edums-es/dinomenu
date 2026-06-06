# Status da blindagem tecnica

Atualizado em 6 de junho de 2026.

## Aplicado nesta fase

- Consultas administrativas sensiveis passam a manter o escopo por `restaurant_id`.
- Pedidos do cardapio e do PDV recalculam produtos, adicionais, subtotal e total no backend.
- Precos, nomes, adicionais e totais enviados pelo navegador nao sao mais confiados.
- Estoque e reservado com operacao atomica e pedidos sem saldo suficiente sao rejeitados.
- Numeros de pedidos e ordens de servico usam sequencias atomicas por restaurante.
- Webhook OpenPix aceita somente evento de cobranca concluida e confirma status, identificador e valor diretamente na API.
- Quando `OPENPIX_WEBHOOK_SECRET` esta configurado, o webhook tambem exige assinatura HMAC.
- CORS usa uma lista explicita de origens e producao rejeita configuracao curinga.
- Producao exige `JWT_SECRET` forte e as chaves deixaram de ficar fixas no Docker Compose.
- Autenticacao WebSocket voltou a localizar corretamente o usuario pelo `_id` do MongoDB.
- Uploads sao decodificados e reprocessados para bloquear arquivos falsos, metadados e imagens excessivas.

## Configuracao obrigatoria para producao

1. Copiar `.env.example` para um arquivo `.env` fora do Git.
2. Definir `APP_ENV=production`.
3. Gerar valores fortes para `JWT_SECRET` e `EVOLUTION_API_KEY`.
4. Configurar `CORS_ORIGINS` e `FRONTEND_URL` com os dominios reais.
5. Configurar o mesmo Secret Key HMAC da OpenPix em `OPENPIX_WEBHOOK_SECRET`.
6. Fazer deploy do backend antes de testar novos pedidos.

## Validacoes executadas

```txt
python -m pytest backend/tests/test_order_security.py -q
5 passed

python -m compileall backend
sucesso

git diff --check
sucesso
```

## Proxima fase recomendada

Ainda exigem projeto proprio e rollout controlado:

- fila persistente para WhatsApp, push e outros eventos assincronos;
- adaptador Redis/pub-sub antes de executar multiplas replicas do WebSocket;
- trilha de auditoria persistente para acoes administrativas;
- rotina automatizada e testada de backup, restore e rollback;
- rate limiting para login, cadastro, consulta de pedidos e endpoints publicos;
- rotacao dos segredos que ja tenham sido usados em ambientes compartilhados.

Enquanto WebSocket e tarefas assincronas permanecerem em memoria, manter apenas uma replica do backend.
