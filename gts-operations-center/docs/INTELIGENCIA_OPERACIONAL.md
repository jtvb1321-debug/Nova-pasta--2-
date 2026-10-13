# Inteligência Operacional (assistente de IA somente leitura)

Módulo do Orbia que responde perguntas em linguagem natural sobre **operações** (chamados, SLA, equipes) e **estoque**,
usando apenas consultas autorizadas ao banco do próprio sistema. O assistente **só lê**: não existe nenhuma ferramenta
que escreva, apague, transfira, dê baixa ou compre.

> Estado: implementado e testado **somente em ambiente local**. Não foi publicado, enviado ao GitHub nem aplicado em
> nenhum banco remoto. Para publicar é preciso aprovação, backup e a migração `prisma/migracoes-sql/20261009_orbia_ia_assistente.sql`.

## Como funciona

```
Pergunta -> validação/limites -> (modelo escolhe ferramentas) -> servidor valida + autoriza + executa + audita -> resposta
```

- O modelo **só escolhe** qual ferramenta chamar. Quem valida os parâmetros, checa permissão e escopo, executa e audita é o servidor.
- Todo número exibido vem das ferramentas; o texto do modelo apenas resume. Indicadores, referências, recomendações e fonte
  aparecem na tela separados do texto e nunca são escritos pelo modelo.
- Dados pessoais (nome, telefone, CPF, endereço, IP de avaliação) não são enviados ao modelo. Chamados são identificados só pela OS.

## Acesso e permissões

| Permissão (`permissions.ts`) | Para quê | Admin | Gestor | Demais |
|---|---|---|---|---|
| `usarAssistenteIA` | Abrir a tela e as rotas `/api/ia/*` | sim | sim | não |
| `iaOperacional` (+ `verDesempenho`) | Ferramentas operacionais | sim | sim | não |
| `iaEstoque` (+ `verEstoque`) | Ferramentas de estoque | sim | sim | não |
| `apenasMinhaEquipe` | Escopo: só dados da própria equipe | — | — | — |

Quem tiver escopo de equipe só consulta a própria equipe; pedir outra é **negado e auditado**. Consultas do estoque geral
(`consultar_estoque`, `materiais_abaixo_minimo`, `prever_reposicao`) exigem acesso a todas as equipes.
O sistema atende uma única empresa (não há multiempresa), então o isolamento é por usuário e por equipe.

## Ferramentas (16)

**Operações:** `resumo_diario_chamados`, `chamados_criticos`, `analisar_sla`, `comparar_equipes`, `produtividade`,
`consultar_metas`, `atendimentos_pendentes`, `tendencias_desempenho`.
Chamados **EACE** e **convencionais** são sempre separados: no EACE o SLA só começa no início do atendimento.

**Estoque:** `consultar_estoque`, `materiais_abaixo_minimo`, `consultar_movimentacoes`, `materiais_por_equipe`,
`consultar_equipamento`, `analisar_consumo`, `prever_reposicao`, `consultar_devolucoes`.

Regras de estoque: unidades de medida nunca são somadas entre si; mínimo não cadastrado nunca é inventado; reserva de
chamado não é movimentação física (e **não baixa o saldo** no sistema, então "saldo livre" é estimativa); item
atribuído a um técnico ou pendente **nunca** é classificado como perdido/extraviado; a previsão de reposição é
aproximada e só sugere quantidade com dados suficientes.

## Dúvidas sobre o sistema (guias "como fazer")

Antes de chamar qualquer modelo, o servidor interpreta a pergunta **por palavras-chave** (`src/lib/ia/conhecimento/`):

| Tipo de pergunta | Exemplo | O que acontece |
|---|---|---|
| Pedido de alteração | "adicione 3 itens ao estoque" | Nada é alterado. Responde com o passo a passo na tela (menu, botão e janela reais), audita `IA_PEDIDO_ESCRITA` |
| Como fazer / onde fica | "como retiro material?", "onde fica o mapa?" | Guia com passos numerados (ou o caminho do menu) |
| Definição | "o que é EACE?", "o que é saldo livre?" | Texto do glossário do sistema |
| Dados | "como está o SLA neste mês?" | Segue para as ferramentas (mock ou OpenRouter) |

Cobertura atual: 43 guias (estoque, chamados, equipes, desempenho, mapas, vendas, financeiro, relatórios, auditoria, configurações,
Modo TV, perfis de acesso...), um glossário de 27 termos, a apresentação "o que você pode fazer" e o mapa de menus.

Onde aparece: na tela cheia (`/inteligencia-operacional`) e no **chat lateral**, um botão "Assistente" no canto inferior direito de
qualquer tela (componente `ChatLateralIA`, montado no `AppShell`; só para quem tem a permissão `usarAssistenteIA`). Em telas largas
ocupa uma coluna ao lado do conteúdo; no celular abre sobre a tela. A conversa continua ao trocar de página (sessionStorage).

Essas respostas são fixas (não são IA e não consomem cota do OpenRouter) e valem em qualquer provedor. Para ensinar um assunto novo,
adicione um item em `guias.ts` (nomes de telas/botões conferidos no código) ou em `glossario.ts` e um teste em `tests/ia/conhecimento.test.ts`.
Manipulação (ignorar regras, revelar prompt, SQL, credenciais) continua **bloqueada**, com `IA_INJECAO_SUSPEITA`.
Limite: é correspondência por palavras; frases muito diferentes das previstas caem na lista "assuntos que eu sei ensinar".

## Provedor de IA

| `ORBIA_AI_PROVIDER` | O que é |
|---|---|
| `mock` (padrão) | **Não é IA.** Escolhe ferramentas por palavras-chave. Toda resposta sai marcada como *simulada* (selo na tela, `simulada=true` no histórico). |
| `openrouter` | Modelo **gratuito** do OpenRouter. A chave fica só no servidor. |

### Ativar o OpenRouter (desenvolvimento)

1. Crie uma chave gratuita em openrouter.ai (não a envie em chat nem a grave em código).
2. No `.env.local`: `ORBIA_AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY=<sua chave>`, `OPENROUTER_MODEL=<modelo>:free`.
3. Modelo: precisa terminar em `:free`, ter preço zero na **lista pública atual** do OpenRouter e suportar ferramentas
   (`tools`). Isso é **verificado a cada uso** (cache de 10 min); se não valer, a IA fica bloqueada em vez de usar outro modelo.
   Em 09/10/2026 havia 15 modelos gratuitos, por exemplo `google/gemma-4-31b-it:free` e `nvidia/nemotron-3-super-120b-a12b:free`.
   A lista muda com frequência: confira em https://openrouter.ai/api/v1/models antes de escolher.
4. Sem fallback: a requisição envia `provider.allow_fallbacks=false`, não envia lista de modelos alternativos e descarta
   respostas que digam ser de outro modelo.

Falhas tratadas: cota esgotada (429/402), chave recusada (401/403), timeout, indisponibilidade, modelo não gratuito,
resposta inválida. A tela mostra uma mensagem amigável e "Tentar novamente"; nenhum detalhe técnico nem chave aparece.

## Limites e segurança

- Entrada máxima 1000 caracteres; 5 chamadas de ferramenta por pergunta; timeout de 30 s; 8 perguntas/min e 200/dia por usuário
  (variáveis `ORBIA_AI_*`). Consultas têm período máximo de 366 dias, paginação (até 50) e timeout de 15 s por ferramenta.
- SQL, troca de regras, revelar prompt/credenciais são **bloqueados antes de chamar o modelo**
  (resposta fixa, auditoria `IA_INJECAO_SUSPEITA`). Pedidos de alteração do sistema não são executados: recebem o guia da tela. Texto livre vindo do banco (ex.: motivo de movimentação) é neutralizado
  antes de ir ao modelo, para que ninguém consiga "instruir" a IA por dentro dos dados.
- O servidor só executa as ferramentas da aba aberta; qualquer outra é negada (`IA_FERRAMENTA_NEGADA`).
- Auditoria: toda execução vira um registro em `ia_execucoes_ferramenta` (usuário, origem chat/mcp, ferramenta, parâmetros
  validados, status, duração, resumo curto). Segredos são removidos antes de gravar.
- Histórico em `ia_conversas` / `ia_mensagens`; cada usuário só enxerga as próprias conversas.

## MCP (somente local)

`npm run ia:mcp` inicia um servidor MCP por **stdio** (sem porta, sem endpoint público) com o SDK oficial
`@modelcontextprotocol/sdk` 1.32.1 (a v2 ainda não foi publicada). Ele usa as **mesmas** ferramentas e o **mesmo executor** do chat.

Requisitos (o script recusa se faltar algum): `ORBIA_MCP_USER_EMAIL` de um usuário ativo (o cliente age com as permissões
dele) e `DATABASE_URL` com host local (ou `ORBIA_MCP_ALLOW_REMOTE_DB=true`, de forma explícita). O cliente só vê as
ferramentas que o usuário pode usar, todas anotadas como `readOnlyHint`.

## Banco

Três tabelas novas e independentes (nenhuma tabela existente foi alterada): `ia_conversas`, `ia_mensagens`,
`ia_execucoes_ferramenta`. Migração versionada em `prisma/migracoes-sql/20261009_orbia_ia_assistente.sql` (só cria objetos).
Os testes usam o banco local **isolado** `gts_orbia_ai_test` (host local obrigatório, nome obrigatório); o `.env` de produção nunca é lido.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run test:ia:banco` | Cria/atualiza o banco local isolado de testes |
| `npm test` | Roda os testes (dados sintéticos "TESTE IA") |
| `npm run test:ia:semear` | Recria os dados sintéticos para ver a tela no navegador |
| `npm run dev -- -p 3100` | Servidor local; a tela fica em `http://localhost:3100/inteligencia-operacional` |
| `npm run ia:mcp` | Servidor MCP local (stdio) |

Usuários de teste (banco isolado): `admin@`, `gestor@`, `operador@` e `tecnico@teste-ia.local`; a senha de teste está em `tests/ia/dados.ts`.

## Limitações conhecidas

- Não há estoque no IXC: o adaptador de IXC não foi necessário. Nenhuma consulta ao IXC é feita por este módulo.
- Não há cadastro de pedidos de compra: "reposição já solicitada" não entra na previsão (só solicitações de material das equipes, como informação).
- O sistema não registra qual técnico executou cada chamado (produtividade é por equipe) nem qual equipamento deve voltar de cada retirada.
- Só há metas de SLA; metas de produtividade não existem no sistema.
- O OpenRouter real só foi exercitado com `fetch` simulado nos testes (sem chave não há chamada real).
- O menu lateral do shell administrativo ocupa grande parte da tela em celular (comportamento já existente em todas as páginas admin).
