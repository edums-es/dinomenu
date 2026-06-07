# Dino Menu

Cardapio digital e sistema de gestao para restaurantes.

## Banco de dados

O backend usa PostgreSQL 16 com documentos JSONB. Configure a conexao pela
variavel:

```text
DATABASE_URL=postgresql://usuario:senha@host:5432/banco
```

No Railway, adicione um servico PostgreSQL e referencie a `DATABASE_URL` dele
no servico do backend. Veja [docs/RAILWAY_POSTGRESQL.md](docs/RAILWAY_POSTGRESQL.md).

## Desenvolvimento com Docker

```powershell
$env:EVOLUTION_API_KEY="chave-local"
$env:JWT_SECRET="uma-chave-local-com-pelo-menos-32-caracteres"
docker compose up --build
```

Se a porta `5432` estiver ocupada:

```powershell
$env:POSTGRES_PORT="55432"
docker compose up --build
```

## Desenvolvimento sem Docker

```powershell
$env:DATABASE_URL="postgresql://dinomenu:dinomenu@localhost:5432/dinomenu"
$env:JWT_SECRET="uma-chave-local-com-pelo-menos-32-caracteres"
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Em outro terminal:

```powershell
cd frontend
npm install --legacy-peer-deps
npm start
```
