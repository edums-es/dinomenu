# EG Delivery — Cardápio Digital & Delivery (SaaS multi-restaurante)

## Problem Statement
Plataforma SaaS completa de cardápio digital e delivery para restaurantes. Cardápio público mobile-first (carrinho, checkout via WhatsApp + pedido interno), painel admin do restaurante (gestão completa) e super admin da plataforma.

## Stack
- Backend: FastAPI + MongoDB (motor), JWT auth (Bearer), Emergent Object Storage
- Frontend: React 19, Tailwind, shadcn/ui, recharts, lucide-react
- Fonts: Outfit (display) + Manrope (público), Inter (admin). White-label via CSS vars --brand-primary/secondary

## Personas
- Cliente final (cardápio público, sem cadastro)
- Dono/Gerente/Atendente/Cozinha do restaurante (painel /admin)
- Super admin da plataforma (/super)

## Implemented (2026-05-30)
- Auth JWT email/senha (login, register-restaurant, me) com roles e brute-force-free seed
- Multi-tenant: dados isolados por restaurant_id; super_admin global
- Cardápio público /loja/:slug: header capa+logo+status aberto/fechado, tabs (cardápio/info/avaliações), banners, busca, chips de categoria, cards de produto, modal com grupos de adicionais (single/multiple, obrigatório, min/max), avaliações
- Carrinho + checkout: cupom, taxa por bairro/fixa, entrega/retirada, formas pagamento (Pix com chave), troco, WhatsApp formatado + pedido interno
- Painel admin: dashboard (KPIs, top produtos, pedidos recentes, abrir/fechar loja), pedidos (filtros, mudança de status, detalhes, imprimir, WhatsApp), produtos (CRUD + editor de adicionais + upload), categorias, cupons, banners, relatórios (gráfico recharts), configurações (loja, aparência/cores, horários, entrega, pagamento)
- Super admin: métricas globais (GMV, lojas, pedidos), restaurantes (criar, suspender, mudar plano), usuários
- Object storage: upload de imagens (logo/capa/produto/banner) + serving público
- Seed: super@menudigital.com/super123, demo dono@burger.com/dono123 (slug burger-lanches)

## Tested
- Backend 31/31 pytest PASS. Frontend: cardápio, carrinho->checkout, login, dashboards verificados.

## Backlog (P1/P2)
- P1: Notificações sonoras de novo pedido no painel; rastreamento de status pelo cliente (página /pedido/:id)
- P1: Assinaturas/billing (Stripe) por plano; limites de recursos por plano
- P2: IA para descrições de produtos; cálculo de entrega por distância (Google Maps)
- P2: Horários especiais/feriados; impressão térmica; SEO/OpenGraph dinâmico por loja; papéis granulares (gerente/atendente/cozinha) na UI
