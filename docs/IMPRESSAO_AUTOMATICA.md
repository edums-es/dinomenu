# Arquitetura de impressao automatica

## Objetivo

Imprimir pedidos automaticamente em uma impressora termica instalada no Windows,
mesmo quando o painel web estiver fechado ou a internet oscilar.

## Componentes

1. **Produtor de tarefas**: o backend cria uma tarefa persistente junto ao evento
   de pedido configurado (`created` ou `accepted`).
2. **Fila persistente**: `print_jobs` guarda payload, estado, tentativas, lease e
   erros. A chave unica impede a duplicacao do mesmo pedido e gatilho.
3. **Pareamento**: o dono entra no agente com e-mail, senha e token temporario.
   O servidor devolve uma credencial exclusiva do computador.
4. **Agente Windows**: consulta a fila, formata ESC/POS, envia ao spooler nativo
   do Windows e confirma a tarefa.
5. **Painel**: ativa a regra, gera token, mostra computadores e acompanha falhas.

## Estados da tarefa

`queued -> printing -> printed`

Em falha, a tarefa volta para `queued` com espera progressiva. Depois de 20
tentativas ela fica em `failed` e pode ser reenviada manualmente pelo painel.
Uma tarefa `printing` cujo lease expirou pode ser assumida novamente.

## Garantias

- O pedido nao se perde quando o computador esta desligado.
- O navegador nao participa da impressao.
- A mesma tarefa possui uma chave idempotente no servidor.
- O agente mantem um registro local dos ultimos trabalhos enviados ao spooler
  para confirmar novamente sem reimprimir apos uma queda de rede.
- A credencial do agente e protegida com DPAPI e pode ser revogada no painel.

## Limite fisico

O spooler confirma que recebeu os bytes, nao que o papel saiu fisicamente. Falta
de papel, tampa aberta e atolamento dependem do driver/modelo da impressora e
devem ser resolvidos no equipamento.
