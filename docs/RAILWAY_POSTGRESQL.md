# PostgreSQL no Railway

O backend do Dino Menu usa PostgreSQL por meio da variavel `DATABASE_URL`.

## Configuracao

1. No projeto Railway, adicione um servico PostgreSQL.
2. No servico do backend, crie uma referencia para `DATABASE_URL` usando a
   variavel disponibilizada pelo PostgreSQL do Railway.
3. Configure tambem `JWT_SECRET`, `CORS_ORIGINS`, `FRONTEND_URL` e as demais
   variaveis descritas em `.env.example`.
4. Publique o backend.

Na inicializacao, o backend cria automaticamente:

- a tabela `documents`, que armazena os dados em JSONB;
- os indices usados pela aplicacao;
- o super admin e os dados iniciais quando ainda nao existem.

O backend falha na inicializacao quando `DATABASE_URL` estiver ausente ou a
conexao com PostgreSQL nao puder ser estabelecida.

## Formato da URL

```text
postgresql://usuario:senha@host:5432/banco
```

No Railway, use preferencialmente a URL interna fornecida pelo proprio plugin
PostgreSQL para evitar trafego externo.
