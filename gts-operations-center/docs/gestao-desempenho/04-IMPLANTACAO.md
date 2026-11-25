# Gestão de Desempenho — implantação (nada é aplicado automaticamente)

Branch: `feature/gestao-desempenho` (a partir da `producao` 1.0.65). **Sem deploy sem aprovação.**

## Ordem segura (padrão dos demais deploys)

1. **Backup** do banco de produção (`pg_dump -n public -Fc`, pasta `backups-gtscenter`).
2. **SQL antes do app**: revisar e executar `prisma/sql/gestao-desempenho.sql` (apenas `CREATE TYPE/TABLE/INDEX` e chaves estrangeiras das próprias tabelas `gd_*`; não altera nenhuma tabela existente), em transação (`BEGIN`/`COMMIT`). Reversão: `DROP TABLE gd_* CASCADE` e `DROP TYPE Gd*` (nada existente depende delas).
3. Pacote `discloud-1.0.N` e `discloud app commit`; **reinício em janela combinada** (o sistema não deve parar em horário de uso).
4. Entrar como ADMIN: *Gestão de Desempenho › Configurações* → criar as unidades (Talita, Grazzi, Pedro e Heytor, Alex e Bernardo), colaboradores, vincular as **equipes do GTSCenter** (atenção: no banco a Equipe 01 é "Alex e Bernardo" e a Equipe 02 é "Pedro e Heytor", o inverso do texto da especificação; existe também a Equipe 05 "Bernardo e Pedro"), cadastrar metas.
5. Só depois, se desejado, definir `GESTAO_DESEMPENHO_ATIVO=true` (liga o agendador: sincronização a cada 15 min, fechamento diário e semanal automáticos). **Desligado por padrão.**
6. Configurar o OPA conforme `03-CONFIG-OPA.md`.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `GESTAO_DESEMPENHO_ATIVO` | `true` liga o agendador em segundo plano (padrão: desligado) |
| `OPA_API_URL`, `OPA_API_TOKEN` | integração com o OPA (ver `03-CONFIG-OPA.md`) |

## O que o módulo toca no sistema existente

- `schema.prisma`: somente modelos novos `gd_*` (nenhum existente alterado).
- `permissions.ts`: 9 permissões novas; `middleware.ts`: bloqueio do módulo ao perfil Operador; `Sidebar.tsx`: item de menu; `instrumentation.ts`: registro do agendador (inerte sem a variável).
- `diagnosticoConexao/relatorio.ts` (gerador de PDF compartilhado): ganhou `grafico` (barras agrupadas) — opcional, os demais relatórios não mudam.
- **Não** altera a Central de Chamados/Agenda, o SLA, a bonificação nem a tela "Desempenho das Equipes".

## Reprocessamento e histórico

Relatório fechado guarda os números congelados. O reprocessamento (Configurações › Sincronização) atualiza snapshots e relatórios **não fechados**; fechados só mudam por **nova revisão**.
