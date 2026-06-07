# Arquitetura do Dino Menu

Este documento explica como o Dino Menu funciona hoje. Ele foi escrito para
servir como ponto de entrada para uma pessoa desenvolvedora nova no projeto.

## 1. Visao geral

O Dino Menu e uma plataforma SaaS multi-restaurante. Cada restaurante possui
cardapio publico, painel administrativo, pedidos, configuracoes e integracoes
isoladas por `restaurant_id`.

Stack principal:

- Frontend: React 19, React Router, Tailwind CSS, Radix UI e Axios.
- Backend: Python 3.11, FastAPI, Pydantic e asyncpg.
- Banco: PostgreSQL 16 com documentos JSONB.
- Tempo real: WebSocket mantido pelo proprio FastAPI.
- Arquivos: Cloudinary em producao, com fallback local.
- Frontend em producao: build estatico servido por Nginx.
- Impressao local: aplicativo Electron para Windows.
- WhatsApp: Evolution API ou Kirago.
- Pagamento automatico: OpenPix/Woovi.
- Infraestrutura local: Docker Compose.

Fluxo simplificado:

```text
Cliente -> React /loja/:slug -> FastAPI /api/public -> PostgreSQL
                                      |
                                      +-> OpenPix
                                      +-> WhatsApp
                                      +-> WebSocket do painel
                                      +-> fila de impressao -> agente Windows -> impressora
```

Diretorios mais importantes:

```text
backend/             API FastAPI, regras de negocio e integracoes
frontend/src/        aplicacao React
print-agent/         aplicativo Electron da impressora
whatsapp-service/    servico legado/alternativo com whatsapp-web.js
docs/                documentacao tecnica
docker-compose.yml   ambiente completo
```

## 2. Convencoes importantes

### Multi-tenant

Quase todos os documentos de negocio possuem `restaurant_id`. Rotas
administrativas usam `require_restaurant` e sempre devem filtrar consultas por
`restaurant_id`.

Exemplo correto:

```python
await db.products.find({
    "restaurant_id": rid(user),
})
```

Nunca busque, altere ou exclua dados administrativos somente por `id`, sem
confirmar o restaurante. Isso pode expor dados entre clientes.

### Identificadores e datas

- Entidades de negocio usam UUID textual em `id`, criado por `new_id()`.
- Usuarios usam `_id` textual gerado pela camada PostgreSQL.
- Datas normalmente sao strings ISO UTC geradas por `now_iso()`.
- A funcao `clean()` remove `_id` antes de retornar documentos pela API.

### Inicializacao do backend

O ponto de entrada e `backend/server.py`. Ele:

1. Carrega variaveis do arquivo `.env`.
2. Registra todos os routers.
3. Habilita CORS e compressao GZip.
4. Executa `seed()` no startup.
5. Cria indices PostgreSQL e o super admin inicial, caso necessario.

## 3. Como funciona login

Arquivos principais:

- `backend/auth.py`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/App.js`

### Login

O frontend envia:

```http
POST /api/auth/login
{
  "email": "...",
  "password": "..."
}
```

O backend:

1. Normaliza o e-mail para minusculo.
2. Busca o usuario em `db.users`.
3. Valida a senha com `bcrypt`.
4. Gera JWT HS256 com validade de sete dias.
5. Retorna `{ token, user }`.

O frontend salva o JWT em `localStorage` usando a chave `md_token`. O
interceptor Axios adiciona automaticamente:

```http
Authorization: Bearer <token>
```

No carregamento da aplicacao, `AuthProvider` chama `GET /api/auth/me` para
restaurar a sessao. Se o token estiver invalido ou expirado, ele e removido.

### Autorizacao

Roles atuais:

- `super_admin`: acessa `/super`.
- `owner`, `manager`, `attendant`, `kitchen`: acessam `/supermaster`.

No frontend, o componente `Protected` bloqueia rotas por role. No backend:

- `get_current_user`: valida JWT e carrega o usuario.
- `require_roles(...)`: restringe por role.
- `require_restaurant`: exige usuario vinculado a restaurante.

### Cadastro

`POST /api/auth/register` cria restaurante, slug unico, usuario proprietario e
dados de demonstracao por meio de `create_restaurant_with_owner`.

### Pontos de atencao

- O logout atual remove apenas o token do navegador; nao existe blacklist de JWT.
- `JWT_SECRET` precisa ser forte e diferente entre ambientes.
- Existe suporte para token em cookie, mas o frontend atual usa Bearer token.
- A validacao WebSocket usa fluxo proprio em `verify_token_ws`; alteracoes na
  estrutura de usuarios ou JWT devem ser testadas tambem no WebSocket.

## 4. Como funciona loja

Uma loja e um documento na colecao `restaurants`. Ela centraliza identidade,
configuracoes operacionais e chaves de integracao.

Campos importantes:

- Identidade: `name`, `slug`, `logo_url`, `cover_url`, `tagline`.
- Aparencia: `primary_color`, `secondary_color`, cores de texto e botoes.
- Operacao: horarios, pedido minimo, entrega, retirada e formas de pagamento.
- Integracoes: OpenPix, WhatsApp e impressao.
- Tenant: `id` identifica o restaurante e e usado como `restaurant_id`.

Rotas administrativas principais:

```http
GET  /api/admin/restaurant
PUT  /api/admin/restaurant
POST /api/admin/restaurant/toggle-open
GET  /api/admin/restaurant/slug
```

Rotas publicas principais:

```http
GET /api/public/restaurants/:slug
GET /api/public/restaurants/:slug/identity
GET /api/public/restaurants/:slug/share
```

`GET /restaurants/:slug` monta o cardapio completo. O backend busca em paralelo
categorias, produtos, banners, combos e avaliacoes, depois adiciona
`restaurant.is_open`.

`is_restaurant_open()` combina:

- `is_open_manual`;
- horario do dia atual;
- horarios que atravessam meia-noite;
- timezone `America/Sao_Paulo`.

O endpoint `/identity` retorna somente nome, logo e cores. Ele existe para telas
como "Meus Pedidos" nao precisarem baixar o cardapio inteiro.

O frontend guarda temporariamente a identidade em `sessionStorage` por meio de
`frontend/src/lib/publicRestaurantCache.js`.

## 5. Como funciona produto

Arquivos principais:

- `backend/models.py`, modelo `ProductIn`
- `backend/routes_admin.py`
- `frontend/src/pages/admin/Products.jsx`
- `frontend/src/pages/public/MenuPage.jsx`
- `frontend/src/components/public/ProductDrawer.jsx`

Um produto pertence a um restaurante e opcionalmente a uma categoria:

```text
product.restaurant_id -> restaurant.id
product.category_id   -> category.id
```

Campos relevantes:

- Nome, descricao, imagem e precos.
- Disponibilidade, destaque e mais vendido.
- `sort_order`.
- Grupos de adicionais em `option_groups`.
- Controle de estoque opcional.

Rotas CRUD:

```http
GET    /api/admin/products
POST   /api/admin/products
PUT    /api/admin/products/:id
DELETE /api/admin/products/:id
```

O painel permite buscar e filtrar por categoria/disponibilidade. Tambem existe
importacao e exportacao Excel:

```http
GET  /api/admin/products/export
POST /api/admin/products/import
```

No cardapio, produtos indisponiveis continuam visiveis, mas nao podem ser
adicionados. Imagens abaixo da primeira dobra usam carregamento lazy.

Ao criar um pedido, o backend reduz `stock_quantity` caso `track_stock` esteja
habilitado.

## 6. Como funciona categoria

Arquivos principais:

- `backend/models.py`, modelo `CategoryIn`
- `backend/routes_admin.py`
- `frontend/src/pages/admin/Categories.jsx`

Categorias organizam os produtos no cardapio. Campos principais:

- `name`
- `icon`
- `sort_order`
- `is_active`
- `restaurant_id`

Rotas:

```http
GET    /api/admin/categories
POST   /api/admin/categories
PUT    /api/admin/categories/:id
DELETE /api/admin/categories/:id
PUT    /api/admin/categories/reorder
```

A tela administrativa usa arrastar e soltar. Ao soltar, envia a lista ordenada
de IDs para `/categories/reorder`, e o backend recalcula `sort_order`.

O cardapio publico retorna apenas categorias ativas e as ordena por
`sort_order`.

Atencao: excluir uma categoria atualmente tambem exclui todos os produtos
daquela categoria.

## 7. Como funciona pedido

Arquivos principais:

- `backend/models.py`, modelos `OrderIn`, `OrderItemIn` e `AddressInfo`
- `backend/routes_public.py`
- `backend/routes_admin.py`
- `frontend/src/components/public/CartSheet.jsx`
- `frontend/src/pages/admin/Orders.jsx`
- `frontend/src/pages/public/TrackOrder.jsx`
- `frontend/src/pages/public/MyOrders.jsx`

### Criacao

O cliente monta o carrinho e envia:

```http
POST /api/public/restaurants/:slug/orders
```

Antes de persistir, o backend valida:

1. Restaurante existe, nao esta suspenso e esta aberto.
2. Pedido minimo.
3. Retirada habilitada, quando aplicavel.
4. Cupom e frete gratis.
5. Taxa de entrega esperada para o endereco.

O pedido recebe:

- UUID em `id`;
- numero sequencial por restaurante em `order_number`;
- `status: pending`;
- `payment_status: pending`;
- `restaurant_id`;
- datas ISO;
- sufixo normalizado do telefone para busca indexada.

Depois da insercao:

- Incrementa uso de cupom.
- Atualiza estoque.
- Credita fidelidade, quando habilitada.
- Inicia fluxo de pagamento.
- Notifica painel, push e WhatsApp conforme o pagamento.

### Status

Status aceitos:

```text
pending
accepted
preparing
ready
out_for_delivery
completed
cancelled
```

O painel altera status por:

```http
PUT /api/admin/orders/:id/status
```

Ao mudar status, o backend dispara em background:

- notificacao WhatsApp ao cliente;
- criacao de job de impressao, se configurado;
- evento WebSocket `order_updated`.

### Acompanhamento

```http
GET /api/public/orders/:id
GET /api/public/track?phone=...&slug=...
```

`TrackOrder` consulta um pedido por ID. `MyOrders` busca os pedidos pelo telefone.
Pedidos novos usam `customer_phone_suffix` indexado. Pedidos antigos usam regex
como fallback e sao atualizados para o formato indexado na primeira busca.

### Pontos de atencao

- `order_number` usa `count_documents + 1`; pedidos concorrentes podem receber o
  mesmo numero. Para alta escala, migrar para contador atomico.
- O backend confia em varios valores monetarios enviados pelo frontend e valida
  principalmente a taxa de entrega. Uma futura revisao deve recalcular todos os
  totais no servidor usando os produtos persistidos.

## 8. Como funciona pagamento

O restaurante configura `payment_methods`, chave Pix manual e, opcionalmente,
`openpix_app_id`.

### Pagamentos manuais

Dinheiro, cartao e Pix sem OpenPix criam o pedido imediatamente. O restaurante
recebe evento WebSocket, push e WhatsApp logo apos a criacao.

O sistema registra a forma escolhida, mas nao processa cartao diretamente.

### Pix automatico OpenPix

Quando a forma contem "pix" e o restaurante possui `openpix_app_id`:

1. O pedido e criado como `pending`.
2. O backend cria cobranca na OpenPix usando o `id` do pedido como
   `correlationID`.
3. QR Code e copia-e-cola sao salvos em `pix_charge`.
4. `payment_status` vira `awaiting`.
5. O restaurante ainda nao recebe o novo pedido.
6. Quando a OpenPix confirma o pagamento, o pedido vira `paid` e `accepted`.
7. O backend dispara WebSocket, push, WhatsApp e notificacao ao cliente.

Endpoints:

```http
POST /api/public/openpix/webhook
GET  /api/public/orders/:id/check-pix
```

`check-pix` e um fallback usado pelo frontend enquanto a tela de pagamento esta
aberta. O webhook e o caminho principal.

Pontos de atencao:

- O webhook atual nao valida assinatura da OpenPix.
- A confirmacao e idempotente por `payment_status == paid`.
- O endpoint do webhook precisa estar publicamente acessivel em producao.

## 9. Como funciona impressao

Arquivos principais:

- `backend/routes_printing.py`
- `print-agent/src/main.js`
- `print-agent/src/printService.js`
- `print-agent/package.json`

A impressao possui duas partes:

1. Backend cria e gerencia jobs em `print_jobs`.
2. Aplicativo Electron instalado no Windows busca e imprime esses jobs.

### Configuracao

O restaurante configura:

- impressao habilitada;
- status que dispara impressao;
- nome da impressora;
- quantidade de copias;
- dados incluidos no comprovante.

Cada restaurante possui `printer_agent_token`, usado pelo agente local.

### Criacao do job

`enqueue_print_job()`:

1. Confere se impressao esta habilitada e se o status bate com o gatilho.
2. Monta texto do comprovante.
3. Cria chave `dedupe_key` para evitar impressao duplicada.
4. Insere job com status `queued`.

Tambem existe impressao manual:

```http
POST /api/admin/orders/:id/print
```

### Agente Windows

O Electron inicia com o Windows e permanece na bandeja. A cada cinco segundos,
por padrao, ele chama:

```http
POST /api/print-agent/jobs/claim
```

O agente:

1. Recebe jobs pendentes.
2. Gera arquivo texto temporario.
3. Usa PowerShell `Out-Printer`.
4. Informa sucesso ou falha:

```http
POST /api/print-agent/jobs/:job_id/complete
```

Jobs travados em `claimed` por mais de tres minutos sao reenfileirados. Falhas
sao tentadas no maximo cinco vezes.

### Instalador

O painel baixa um ZIP personalizado contendo:

- `Dino Menu Impressora Setup.exe`;
- configuracao com API e token da loja;
- script de instalacao;
- instrucoes.

O executavel e gerado com:

```powershell
cd print-agent
npm install
npm run dist
```

O backend procura o instalador em `backend/installers` e `print-agent/dist`.

## 10. Como funciona WebSocket

Arquivos principais:

- `backend/routes_ws.py`
- `frontend/src/hooks/useOrdersWS.js`
- `frontend/src/pages/admin/Orders.jsx`

Conexao:

```text
wss://host/api/ws/orders/:restaurant_id?token=JWT
```

O backend mantem uma sala em memoria para cada restaurante:

```python
{restaurant_id: set(websockets)}
```

Eventos usados:

- `new_order`: novo pedido ou Pix confirmado.
- `order_updated`: status alterado.
- `ping`: keepalive.

O hook React reconecta automaticamente apos tres segundos. O backend envia ping
a cada trinta segundos sem mensagem.

Pontos de atencao:

- As salas ficam somente na memoria do processo. Com multiplas replicas do
  backend, clientes conectados em replicas diferentes nao recebem o mesmo
  broadcast. Para escalar horizontalmente, usar Redis Pub/Sub ou equivalente.
- O token fica na query string da conexao.
- Alteracoes em JWT/usuarios devem ser testadas especificamente no
  `verify_token_ws`.

## 11. Como funciona WhatsApp

Arquivos principais:

- `backend/whatsapp.py`
- `backend/routes_whatsapp.py`
- `frontend/src/pages/admin/WhatsApp.jsx`

Providers suportados:

- Evolution API, padrao e self-hosted.
- Kirago, usando token por restaurante.

O provider global e lido de `platform_settings.wa_provider`, com fallback para
variavel de ambiente.

### Saida de mensagens

`send_whatsapp()` normaliza o telefone para formato brasileiro com prefixo `55`
e envia pelo provider configurado.

`notify_order_status()` envia mensagens ao cliente quando o pedido passa pelos
status configurados, incluindo link de rastreamento.

Na criacao do pedido, `_notify_new_order()` envia resumo ao telefone do
restaurante. No Pix automatico, essa notificacao espera a confirmacao.

### Conexao

O painel oferece:

```http
GET    /api/admin/whatsapp/provider
GET    /api/admin/whatsapp/status
GET    /api/admin/whatsapp/qr
DELETE /api/admin/whatsapp/disconnect
PUT    /api/admin/whatsapp/settings
POST   /api/admin/whatsapp/test
```

Na Evolution API, cada restaurante possui uma instancia derivada do
`restaurant_id`. A instancia recebe webhook em:

```text
/api/whatsapp/webhook/:restaurant_id
```

Mensagens recebidas sao registradas em `whatsapp_logs` e respondidas por um
chatbot simples baseado em palavras-chave.

### Pontos de atencao

- `whatsapp-service/` e um servico alternativo/legado com `whatsapp-web.js`; ele
  nao esta no `docker-compose.yml` atual.
- Configure corretamente `PUBLIC_URL`, `BACKEND_URL`, Evolution API e chaves.
- O envio e feito em tarefas assicronas do processo FastAPI, sem fila externa.

## 12. Como funciona upload de imagem

Arquivos principais:

- `backend/storage.py`
- `frontend/src/components/admin/ImageUpload.jsx`

O frontend envia `multipart/form-data` autenticado:

```http
POST /api/upload
```

Formatos aceitos:

- JPG/JPEG
- PNG
- GIF
- WebP

Limite atual: 8 MB.

Se `CLOUDINARY_URL` estiver configurada:

1. O backend envia a imagem ao Cloudinary em uma thread separada.
2. Registra metadados em `db.files`.
3. Retorna URL HTTPS publica.

Sem Cloudinary:

1. Salva em `UPLOAD_DIR`.
2. Registra caminho em `db.files`.
3. Retorna `/api/files/...`.
4. `GET /api/files/:path` serve o arquivo com cache de um dia.

Pontos de atencao:

- O fallback local precisa de volume persistente em producao.
- Nao existe redimensionamento ou conversao automatica das imagens.
- O upload valida extensao e tamanho, mas nao inspeciona profundamente o
  conteudo binario.

## 13. Como funciona deploy

### Containers atuais

`docker-compose.yml` sobe:

- `postgres`: PostgreSQL 16 com volume persistente.
- `evolution-api`: integracao WhatsApp com volume de instancias.
- `backend`: FastAPI/Uvicorn na porta 8001.
- `frontend`: build React servido por Nginx na porta 3000.

Volumes:

- `postgres_data`
- `uploads_data`
- `evolution_instances`

O frontend usa build em dois estagios:

1. Node 18 instala dependencias e executa `npm run build`.
2. Nginx serve os arquivos estaticos e faz fallback SPA.

O Nginx tambem:

- encaminha `/api` ao backend;
- detecta crawlers de redes sociais em `/loja/:slug`;
- encaminha crawlers para o endpoint de preview dinamico do restaurante.

### Desenvolvimento local

Com hot reload:

```powershell
docker compose -f docker-compose.dev.yml up --build
```

Ambiente completo:

```powershell
docker compose up --build
```

Sem Docker:

```powershell
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend, em outro terminal
cd frontend
npm install --legacy-peer-deps
npm start
```

### Variaveis importantes

Backend:

```text
DATABASE_URL
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
CLOUDINARY_URL
UPLOAD_DIR
FRONTEND_URL
APP_URL
PUBLIC_URL
BACKEND_URL
EVOLUTION_API_URL
EVOLUTION_API_KEY
```

Frontend, definida no build:

```text
REACT_APP_BACKEND_URL
```

### Checklist de producao

1. Configurar `JWT_SECRET` forte.
2. Trocar credenciais padrao do super admin.
3. Configurar `REACT_APP_BACKEND_URL` para o dominio real antes do build.
4. Configurar `FRONTEND_URL`, `PUBLIC_URL` e `BACKEND_URL`.
5. Configurar Cloudinary ou garantir volume persistente de uploads.
6. Configurar DNS, HTTPS e proxy de WebSocket.
7. Configurar Evolution API/Kirago.
8. Configurar webhook publico da OpenPix.
9. Garantir que `backend/installers/Dino Menu Impressora Setup.exe` esteja no
   build do backend.
10. Verificar logs de startup e criacao dos indices PostgreSQL.
11. Fazer backup do PostgreSQL, uploads e instancias WhatsApp.
12. Testar pedido completo, pagamento, WhatsApp, WebSocket e impressao.

### Pontos de atencao do deploy atual

- O `docker-compose.yml` contem segredos e valores de exemplo; producao deve usar
  variaveis externas ou secrets.
- O argumento padrao do frontend aponta para `http://localhost:8001`; em
  producao ele precisa ser substituido no build.
- CORS do FastAPI esta atualmente aberto para todas as origens.
- WebSocket em memoria limita escalabilidade horizontal.
- Tarefas `asyncio.create_task` nao sobrevivem a reinicio do processo; para
  garantias fortes, usar fila persistente.

## 14. Mapa rapido de arquivos

```text
backend/server.py                 Inicializacao FastAPI e middleware
backend/db.py                     Adaptador PostgreSQL JSONB
backend/models.py                 Modelos Pydantic e regras compartilhadas
backend/auth.py                   Login, JWT e autorizacao
backend/routes_public.py          Cardapio, pedido publico, rastreio e OpenPix
backend/routes_admin.py           Loja, produtos, categorias, pedidos e banners
backend/routes_printing.py        Fila e configuracao de impressao
backend/routes_ws.py              WebSocket do painel
backend/whatsapp.py               Envio, notificacoes e webhook WhatsApp
backend/routes_whatsapp.py        Configuracao de WhatsApp no painel
backend/storage.py                Upload Cloudinary/local
backend/seed.py                   Seed, super admin e indices

frontend/src/App.js               Rotas React
frontend/src/lib/api.js           Axios e token
frontend/src/context/AuthContext.jsx
frontend/src/pages/public/MenuPage.jsx
frontend/src/components/public/CartSheet.jsx
frontend/src/pages/public/TrackOrder.jsx
frontend/src/pages/admin/Orders.jsx
frontend/src/pages/admin/Products.jsx
frontend/src/pages/admin/Categories.jsx

print-agent/src/main.js           Electron, janela e bandeja
print-agent/src/printService.js   Polling e impressao via Windows
```

## 15. Antes de alterar uma funcionalidade

Use esta verificacao:

1. A consulta esta filtrando por `restaurant_id`?
2. A alteracao afeta painel e cardapio publico?
3. A alteracao de pedido precisa disparar WebSocket, WhatsApp ou impressao?
4. A alteracao de pagamento continua idempotente?
5. A resposta publica expoe algum segredo do restaurante?
6. O fluxo funciona com Pix manual e automatico?
7. O deploy precisa de nova variavel, indice ou arquivo?
8. Foram testados desktop e mobile?
