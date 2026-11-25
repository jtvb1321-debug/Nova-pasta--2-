# Gestão de Desempenho — Fase 1: auditoria do GTSCenter (2026-11-25)

Base auditada: branch `producao` (versão 1.0.65). Dados de produção consultados **somente leitura e agregados**.

## 1. O que já existe e será reutilizado (nada é duplicado)

| Necessidade | Fonte existente | Como o módulo usa |
|---|---|---|
| Chamados / O.S. | `Chamado` (`chamados`) | Lê; nunca grava. Atribuição à equipe por `equipeId`. |
| SLA | Campos já gravados no fluxo: `dentroSlaResposta`, `dentroSlaResolucao`, `slaRespostaMinutos`, `slaResolucaoMinutos` (`lib/sla.ts`, metas em `lib/slaMetas.ts`) | **Só lê os campos.** Nenhuma regra de SLA é recalculada ou alterada. População = mesma de `calcularSlaDesempenho`: `dataAbertura` no período, status ≠ CANCELADO, `fechadoAdmin` ≠ true; elegível = flag ≠ null. |
| Rechamada | `statusRechamada` (POSSIVEL/CONFIRMADA/DESCARTADA), `chamadoOrigemReincidenciaId`, janela `JANELA_REINCIDENCIA_DIAS = 7` | Oficial = **CONFIRMADA** (decisão do supervisor). POSSIVEL aparece como "a validar". Responsável = equipe do chamado de origem (mesma regra da bonificação). |
| Satisfação | `AvaliacaoAtendimento` (só `APROVADA` conta) | Média de nota por equipe. |
| Visita improdutiva | `Chamado.clienteAusente` | Contagem (data do evento = `dataACaminho`, senão `dataInicio`). |
| Tempos | `dataACaminho`, `dataInicio`, `dataFim`, `slaResolucaoMinutos` | Deslocamento = ACaminho→Início; execução = Início→Fim; resolução = `slaResolucaoMinutos`. |
| Vendas (recepção) | `Venda` por `vendedorId` | Só quando o colaborador tem usuário vinculado. |
| Equipes / pessoas | `Equipe`, `Funcionario`, `Usuario`, `EscalaTrabalho` | O módulo mapeia suas "unidades avaliadas" para `Equipe` por vigência (não copia dados). |
| Permissões | `lib/permissions.ts` (mapa fixo por papel) + `middleware.ts` | Ganha 9 permissões novas (ADMIN e GESTOR). |
| Jobs em segundo plano | `src/instrumentation.ts` (`setInterval`, ex.: `feedbackAutomaticoJob`) | Mesmo padrão para o sincronizador (roda no servidor, sem tela aberta). |
| PDF / Excel / gráficos | `jspdf` + `jspdf-autotable`, `xlsx`, `recharts`, `chart.js` | **Nenhuma dependência nova.** PDF usa `montarPdf` (com galeria opcional). |
| Menu | `components/layout/Sidebar.tsx` (já existe "Desempenho das Equipes" = SLA/avaliações/bonificação) | Novo item "Gestão de Desempenho", separado; o atual não é alterado. |

**Central de Atividades:** o termo não existe no código. O equivalente é a Central de Chamados/Agenda (`components/agenda/*`, `app/api/agenda`, `app/api/tickets`). **Nenhum arquivo dessas áreas é alterado** pelo módulo (somente leitura de dados).

## 2. Achados que mudam o desenho

1. **Numeração das equipes no banco é o inverso do texto.** Produção: `Equipe 01 — Alex e Bernardo`, `Equipe 02 — Pedro e Heytor` (cadastrado como "Heitor", inativo), `Equipe 05 — Bernardo e Pedro`, além de 03 (Higor) e 04 (Kaio). → O módulo **não depende do número**: cada "unidade avaliada" aponta para uma ou mais `Equipe` com vigência, configurável pelo administrador.
2. **Recepção não tem cadastro próprio.** Não há "Grazzi" entre os usuários; "Thalita" é ADMIN. → Cadastro de colaboradores do módulo (com vínculo opcional a `Usuario`/`Funcionario` e ao atendente do OPA).
3. **Tipos de chamado existentes:** INSTALACAO, MANUTENCAO, RETIRADA, ROMPIMENTO_MASSIVO, SUPORTE. **Não existem** reinstalação, troca de equipamento nem mudança de endereço; `subCategoria` está **vazia em 100% dos 1.063 chamados** dos últimos 180 dias. → Esses 3 indicadores ficam **"Não disponível"** (com preenchimento manual opcional). Nada é inferido do texto.
4. **Sem fonte no sistema** para: retenções (campo e recepção), cancelamentos solicitados, falhas de triagem, atendimentos do OPA. → "Não disponível" / manual.
5. **Não existe modelo de notificação** (há alertas calculados em `/api/alerts` e chaves `alerta_*` em `configuracoes`). → Tabela própria de notificações do módulo.
6. **Metas de SLA são fixas no código** (`slaMetas.ts`). O módulo **respeita** essas metas (só lê o resultado gravado). As metas de desempenho novas ficam no banco.
7. **Fuso:** o servidor da Discloud não está em UTC (ver correção 1.0.65). → Todo cálculo usa `America/Fortaleza` (UTC−3 fixo) explicitamente, nunca o fuso do servidor.

## 3. Dados reais (90 dias, produção, agregados)

- 690 chamados criados; 686 com SLA de resolução e 522 com SLA de resposta gravados; 552 com deslocamento; 522 com início.
- Finalizados por tipo: Manutenção 292, Suporte 171, Retirada 150, Instalação 74, Rompimento 3. Encerrados direto pela gestão (`fechadoAdmin`): 190 de 690 (28%) — **ficam fora da produção das equipes**, e aparecem separados.
- Clientes ausentes: 14. Rechamadas confirmadas: 5; possíveis (a validar): 72.
- 5 chamados sem equipe.

## 4. Disponibilidade dos indicadores

Legenda: ✅ fonte confiável no sistema · ◐ parcial/aproximado · ❌ não disponível (manual ou OPA).

**Campo:** O.S. recebidas ✅ · concluídas ✅ · pendentes ✅ (posição no fechamento) · instalações ✅ · reinstalações ❌ · manutenções ✅ · retiradas ✅ · trocas de equipamento ❌ · mudanças de endereço ❌ · visitas improdutivas ◐ · rechamadas ✅ · retenções em campo ❌ · tempo de deslocamento ✅ · execução ✅ · resolução ✅ · SLA dentro/fora/% ✅ · metas ✅ (configuráveis) · motivos de pendência ◐ (derivados de status/flags).

**Recepção (OPA — depende de credenciais e documentação):** todos ❌ até a integração; exceções com fonte interna: vendas ◐ (via `Venda`, se houver usuário vinculado); atendimentos que geraram chamado ◐ (cruzamento por confirmação do gestor).

## 5. Riscos e decisões

- **Integração OPA:** a lista de endpoints enviada usa domínio de exemplo (`meudominio.com.br`) e IDs de amostra. Sem a documentação real não há como saber autenticação, formato de datas, campos de atendente/SLA/transferência. Implementado apenas: cliente HTTP configurável (token por variável de ambiente), paginação, timeout, retentativas, modelo interno normalizado e **provedor simulado só para testes**. Mapeamento real → pendente (ver `CONFIG-OPA.md`).
- **Produção:** nenhuma migração é aplicada automaticamente. O SQL fica em `prisma/sql/` para ser revisado e executado pelo responsável (padrão já usado nos deploys).
