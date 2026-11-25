# Integração com o OPA Suite — como configurar

**Fonte:** documentação pública da API (coleção Postman publicada em `api.opasuite.com.br`). O mapeamento padrão (`opa/presetOpaSuite.ts`) segue exatamente o que ela descreve. A integração é **somente leitura (GET)**: nada é gravado no OPA.

## O que a documentação do OPA diz (e o módulo usa)

| Tema | Conforme a documentação |
|---|---|
| Autenticação | Cabeçalho `Authorization: Bearer <token>`. O token é gerado **no próprio OPA**, no cadastro de usuários, criando antes um **perfil de permissões do tipo API** |
| Endereço | O domínio da **sua** instalação do OPA (a documentação usa `meudominio.com.br` como exemplo) |
| Listagem | `GET /api/v1/atendimento` com **corpo JSON** `{ "filter": {...}, "options": { "limit": N, "skip": N } }` |
| Filtros | `protocolo`, `dataInicialAbertura`, `dataFinalAbertura`, `dataInicialEncerramento`, `dataFinalEncerramento` (AAAA-MM-DD, intervalo máximo de **1 ano**), `id_atendente`, `status`, `canal_id`, `setor`, `id_cliente`, `motivos.idMotivo`, avaliações. Sem filtro de data = últimos 365 dias |
| Resposta | `{ "status": "success", "code": 200, "data": [ ... ] }` |
| Atendimento | `_id`, `id_atendente`, `protocolo`, `date` (criação), `fim` (encerramento), `status` (`F` finalizado, `EA` em atendimento), `canal`, `setor`, `tags`, `avaliacoes`, `id_motivo_atendimento` |
| Usuários | `GET /api/v1/usuario/` com filtro obrigatório (ex.: `nome`) → `_id`, `nome`, `status` |

## O que isso permite medir na recepção

| Indicador | Situação com a API de listagem |
|---|---|
| Atendimentos recebidos | ✅ (`date`) |
| Finalizados | ✅ (`status = F` + `fim`) |
| Pendentes | ✅ (`status = EA`, inclusive abertos antes do período) |
| Tempo médio de resolução | ✅ (`date` → `fim`) |
| Por atendente | ✅ (`id_atendente`) |
| Abandonados | ❌ a documentação não define o código de situação |
| Primeira resposta, espera, tempo de atendimento | ❌ a listagem não traz o horário em que foi assumido nem da 1ª resposta |
| Transferidos, SLA, resolvidos remotamente | ❌ não há campo na listagem |
| Satisfação | ❌ existe `avaliacoes`, mas os exemplos não mostram a estrutura. Com um atendimento avaliado de verdade, mapeia-se em minutos |

Esses indicadores seguem **Não disponível** (nunca zero). Alguns podem ser viabilizados depois (ex.: horários pelas mensagens do atendimento, `GET /api/v1/atendimento/mensagem` filtrando por `id_rota`) — pedem uma análise à parte.

## Passo a passo para ligar

1. **No OPA:** criar um perfil de permissões do tipo **API** e um usuário integrador, e gerar o **token** (só leitura).
2. **Na Discloud** (variáveis de ambiente do app, nunca no código nem no chat):
   - `OPA_API_URL` = endereço do seu OPA (ex.: `https://seudominio.opasuite.com.br`)
   - `OPA_API_TOKEN` = o token gerado
3. **No Orbia** (ADMIN): Gestão de Desempenho › Configurações › *Sincronização e OPA*:
   1. clique **Usar o mapeamento padrão do OPA Suite** e depois **Salvar mapeamento**;
   2. use **Localizar o identificador de uma atendente** (digite "Talita", "Grazzi") e copie o `_id`;
   3. em *Unidades e equipes*, crie/edite os colaboradores informando esse identificador;
   4. clique **Atualizar agora** e confira a tabela de sincronizações;
   5. marque **Sincronizar com o OPA nas rodadas automáticas**.
4. Para a sincronização automática (a cada 15 min, fechamento diário e semanal), defina `GESTAO_DESEMPENHO_ATIVO=true`.

## Como a sincronização consulta

Para cada período, três buscas, unidas sem duplicar: atendimentos **abertos** no período, **encerrados** no período (abertos antes) e os que **seguem em andamento**. Páginas de 100 (`skip`/`limit`), timeout de 20 s, até 3 tentativas com espera crescente, pausa entre páginas. Se o OPA cair: mantém o último dado válido, registra a falha (sem URL, cabeçalho nem token), notifica **uma vez** e tenta de novo; as equipes de campo não são afetadas.

Limitação: o GET com corpo JSON exige o módulo `https` do Node (o `fetch` padrão recusa); o código já faz isso e há teste contra um servidor HTTP local.

## Segurança e LGPD

- Token e URL só em variáveis de ambiente: nunca exibidos, gravados no banco, em logs, erros ou no navegador.
- A cópia local dos atendimentos guarda só ids, protocolo, situação e datas — **sem nome, CPF, telefone nem conteúdo de conversa**.
- Não há associação automática entre atendimento do OPA e chamado do GTSCenter: com dúvida, nada é associado (a tabela `gd_vinculos_opa_chamado` só recebe sugestões confirmadas pelo gestor).

## Pontos a confirmar na prática (com dados reais)

- Quais códigos de `status` existem além de `F` e `EA` (fila, abandonado…): ao aparecer um código desconhecido, a sincronização avisa e o atendimento não entra como pendente nem finalizado até o mapeamento ser ajustado.
- Se `id_atendente` traz o atendente que **finalizou** ou o atual (para transferências).
