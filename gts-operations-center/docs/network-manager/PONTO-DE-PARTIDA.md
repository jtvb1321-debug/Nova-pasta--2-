# GTS Center Network Manager — ponto de partida (preparação, 2026-10-23)

Nada do módulo foi implementado. Este arquivo reúne o que **já foi verificado no código** (branch `producao`, versão 1.0.51)
para a próxima sessão começar direto na Fase 1, sem refazer o levantamento básico. A especificação completa está em `ESPECIFICACAO.md`.

## O que já existe (verificado nos arquivos)

**Diagnóstico de Conexão** (preservar; evoluir com abas):
- Página: `src/app/diagnostico-conexao/page.tsx`; tela: `src/components/diagnosticoConexao/DiagnosticoConexaoView.tsx` (+ `GraficoConsumo.tsx`).
- APIs: `src/app/api/diagnostico-conexao/{buscar,contratos,consulta,emitido}/route.ts`.
- Serviços: `src/lib/diagnosticoConexao/` — `servico.ts` (busca, contratos, consulta, sessões `radacct`), `equipamento.ts` (ONU), `tipos.ts`, `relatorio.ts` (PDF), `resumo.ts`, `acesso.ts` (permissão `verDiagnosticoConexao`, limite de uso, auditoria `DIAGNOSTICO_CONEXAO_*`).
- Assistente de IA: ferramenta `diagnostico_conexao` em `src/lib/ia/servicos/conexao.ts`.
- Testes: `tests/ia/conexao.test.ts` (IXC falso em `scripts/ixc-falso*.ts`; sonda real somente leitura: `npm run ixc:sonda`).

**IXC** (reutilizar, não duplicar): `src/lib/ixc.ts` (`listarIXC`, POST `/<tabela>`), `src/lib/ixcCliente.ts` (`dadosIxcDoCliente`: cliente, contratos, logins `radusuarios`, planos `radgrupos`), `ixcChamado.ts`, `ixcFiberdocs.ts`, `ixcRelatorios.ts`.

**ONU hoje** (`src/lib/diagnosticoConexao/equipamento.ts`): RX/TX/temperatura/tensão vêm da **aba "Fibra" do IXC** (tabela `radpop_radio_cliente_fibra`); status da ONU opcionalmente do **SmartOLT** (`src/lib/smartolt.ts`) só quando o serial casa exatamente. Leitura vazia ou `0` = "Sem leitura" (nunca 0 dBm). Faixa RX de referência fixa em `FAIXA_RX_DBM` (-27 a -8 dBm) — o pedido é torná-la **configurável por modelo**. Onde aparece "Sem leitura": `DiagnosticoConexaoView.tsx` (cartões RX/TX/temperatura/tensão) e `relatorio.ts` (PDF).

**SmartOLT** (existe e é usado em outros módulos; o pedido é não depender dele): `src/lib/smartolt.ts`, `smartoltMonitor.ts`, `dashboardSnapshot.ts`, `src/app/smartolt/`, `src/components/smartolt/SmartOLTView.tsx`, rotas `api/smartolt/status`, `api/diagnostico/*` (reiniciar ONU, testes remotos), cartões NOC (`OltLinksCard`, `KpiRow`, `TVDashboard`…). Variáveis: `SMARTOLT_API_URL`, `SMARTOLT_API_KEY`.

**MikroTik**: **não há integração**. `src/app/api/dashboard/mikrotik/route.ts` só devolve `disponivel: false` ("Integração MikroTik/RouterOS ainda não configurada"); `trafego/route.ts` e `MikrotikStatusCard.tsx` consomem isso.

**Huawei/SNMP/SSH**: nenhuma dependência nem código (`grep` por huawei/snmp sem resultado). Será estrutura nova.

**Segurança e infraestrutura existentes**: NextAuth + `src/middleware.ts` (perfis ADMIN/GESTOR/OPERADOR/TECNICO/VENDEDOR/COMERCIAL), permissões em `src/lib/permissions.ts`, auditoria `registrarLog` (`src/lib/auditLog.ts`, tabela `logs`), limite de uso `src/lib/ia/limites.ts`, coletas agendadas via `instrumentation.ts`/jobs em `src/lib/*Job.ts`. Banco: Postgres/Supabase com Prisma; migrações são **SQL manual** em `prisma/migracoes-sql/` (gerar com `prisma migrate diff`, aplicar com backup; quem aplica em produção é o usuário). Deploy: Discloud (pacote `deploy/discloud-1.0.N`, ver `deploy/montar-pacote.sh`).

## Limitação central a decidir antes da Fase 2

O app roda na **Discloud (nuvem)**. OLTs e MikroTiks ficam em **rede de gerência privada**: o servidor da Discloud provavelmente **não alcança** SNMP/SSH/API dessas redes. É preciso escolher a arquitetura de coleta:
1. **Agente/coletor local** (um serviço pequeno dentro da rede da GTSNET, falando com OLT/MikroTik e enviando leituras ao GTS Center por HTTPS autenticado) — o mais provável e mais seguro.
2. VPN/túnel entre a Discloud e a rede de gerência (depende de suporte da hospedagem).
3. Expor as interfaces dos equipamentos à internet — **não recomendado**.
Qualquer opção respeita a regra "a interface nunca acessa a OLT/roteador"; só o backend/coletor.

## Informações que precisam ser confirmadas com o usuário (Fase 1)

- Modelo(s) das OLTs Huawei (MA5608T, MA5680T, MA5800…) e versão do software; quantas OLTs, quantas ONUs.
- Interfaces liberadas: SNMP (v2c/v3? community/usuário), SSH (usuário somente leitura?), syslog/traps para onde?
- ONUs: marcas/modelos; como o serial e o MAC estão cadastrados no IXC (aba Fibra).
- MikroTik: quantos roteadores, versão do RouterOS (REST exige v7.1+), contas de menor privilégio, onde ficam os concentradores PPPoE.
- Onde rodaria o coletor (servidor local, VM, Raspberry?) e se há VPN.
- Qual OLT de teste usar para homologar sem risco, e quem pode autorizar acesso.
- Limites de referência de potência por modelo de ONU/OLT e frequência de coleta desejada.

## Arquivos prováveis (a confirmar na Fase 1)

Criar: `src/lib/rede/` (abstração `ConectorOlt` + `huawei/`, `mikrotik/`, `inventario`, `vinculos`, `diagnosticoRede`), rotas `src/app/api/rede/*`, coletor (serviço separado), `prisma/migracoes-sql/<data>_rede.sql` (equipamentos, OLTs, PONs, ONUs, leituras ópticas, eventos, vínculos, coletas, operações/auditoria; credenciais **criptografadas**, nunca em texto puro), testes com mocks em `tests/ia/rede*.test.ts`, `docs/network-manager/HOMOLOGACAO.md`.
Alterar: `src/lib/diagnosticoConexao/equipamento.ts` e `tipos.ts` (nova fonte + estados "atual/histórico/indisponível/não suportado/falha de comunicação"), `DiagnosticoConexaoView.tsx` (abas), `permissions.ts` (perfis leitura × operação), `middleware.ts`, `relatorio.ts`, `api/dashboard/mikrotik/route.ts` (trocar o "não configurado" quando houver conector real).

## Regras de trabalho já combinadas (resumo)

Fase 1 primeiro (análise + plano, sem alterar nada), depois Fase 2 incremental. Só leitura até homologar; sem comandos arbitrários vindos do navegador; sem leituras simuladas em produção; testes com mocks; deixar explícito o que depende de equipamento real. Publicar só com autorização do usuário; SQL em produção é aplicado pelo usuário (script com backup).
