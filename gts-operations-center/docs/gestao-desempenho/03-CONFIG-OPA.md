# Integração com o OPA Atendimento — como configurar

**Situação:** a lista de endpoints recebida usa domínio de exemplo (`meudominio.com.br`) e IDs de amostra, e **não traz** a documentação de autenticação, de parâmetros nem do formato das respostas. Por isso **nenhum nome de campo, parâmetro ou método de autenticação foi inventado**: tudo é configurado a partir da documentação oficial do OPA. Enquanto não estiver configurado, a recepção mostra **Não disponível**.

A integração é **somente leitura (GET)**. Nada é gravado no OPA.

## 1. Segredos (somente no servidor)

Variáveis de ambiente do app (painel da Discloud), **nunca** no código, no banco, no navegador, nos logs ou no Git:

| Variável | Conteúdo |
|---|---|
| `OPA_API_URL` | URL base da API do cliente (ex.: `https://SEU-DOMINIO.opasuite.com.br`) |
| `OPA_API_TOKEN` | token de acesso (permissão de **leitura**) |

O token não é exibido nem retornado por nenhuma tela ou API. Erros e logs de sincronização não contêm URL, cabeçalhos nem token.

## 2. Mapeamento (Gestão de Desempenho › Configurações › Sincronização e OPA — só ADMIN)

Preencha **exatamente como está na documentação do OPA**:

1. **Caminho da lista de atendimentos por período** (a lista informada sugere `/api/v1/atendimento` e `/api/v1/atendimento/periodo`; confirme qual usar e como filtrar o período).
2. **Autenticação:** nome do cabeçalho e prefixo do valor (ex.: `Authorization` + `Bearer `).
3. **Parâmetros:** data inicial, data final, página e tamanho da página (e o formato da data: ISO com hora ou só a data).
4. **Onde está a lista na resposta** (ex.: `data.items`; vazio se a resposta já é a lista).
5. **Campos do atendimento** (caminho no JSON, como `atendente.id`): id, atendente, protocolo, criação, assumido, primeira resposta, finalização, situação, transferido, dentro do SLA, resolvido remotamente, nota.
6. **Valores da situação** que significam *finalizado*, *abandonado*, *em atendimento* e *aberto*.

Só vira indicador o que for mapeado: sem "primeira resposta" mapeada, "tempo de primeira resposta" fica **Não disponível**. Situação fora dos valores informados vira *desconhecida* (não conta como pendente nem como finalizado, e é avisada na sincronização).

## 3. Vincular as colaboradoras

Em *Unidades e equipes › Novo colaborador*, informe o **identificador do atendente no OPA** (como a API o devolve). Sem ele, a sincronização avisa "colaboradora sem atendente do OPA vinculado" e não atribui atendimentos.

## 4. Ligar a sincronização

1. Salve o mapeamento e confira o estado ("mapeamento completo", URL e token "configurados").
2. Clique **Atualizar agora** e veja o resultado na tabela de sincronizações.
3. Marque **Sincronizar com o OPA nas rodadas automáticas**.

Comportamento: a cada 15 min (configurável), reprocessa os últimos N dias (padrão 7; SLA e avaliações chegam depois). Timeout de 20 s, até 3 tentativas com espera crescente, paginação, pausa entre páginas. Se o OPA cair: preserva o último dado válido, registra a falha (sem dado sensível), notifica **uma vez** e tenta de novo na próxima rodada; as equipes de campo não são afetadas.

## 5. Pontos a confirmar com a documentação real

- O filtro de período da API é por **data de criação**? Atendimentos criados antes da janela e finalizados dentro dela só entram se a API os devolver — ajuste a janela de reprocessamento ou o endpoint.
- A resposta traz o atendente como id estável? Qual o campo?
- Existe indicador de SLA, transferência, resolução remota e nota na resposta? Se não, ficam indisponíveis.

## 6. Cruzamento OPA × chamados (LGPD)

Não há associação automática: com dúvida, nada é associado. A tabela `gd_vinculos_opa_chamado` existe para sugestões (protocolo/ID do cliente) **que só valem após confirmação do gestor**. A cópia local dos atendimentos guarda apenas ids, situação e datas — sem nome, telefone nem conteúdo de conversa.
