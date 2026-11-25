# Gestão de Desempenho — fórmulas e critérios de atribuição

Fuso de todos os cálculos: **America/Fortaleza** (UTC−3 fixo). Código: `src/lib/gestaoDesempenho/`. Cada regra abaixo tem teste automatizado (`tests/ia/gestaoDesempenho*.test.ts`).

## 1. Princípio geral

A unidade (colaboradora ou equipe) guarda **contadores por dia** (numeradores e denominadores). Semana, mês e período personalizado **somam os contadores** e só então calculam % e médias. **Nunca** se faz a média das porcentagens diárias.

| Indicador consolidado | Fórmula |
|---|---|
| SLA (resolução, resposta, recepção) | Σ dentro do SLA ÷ Σ avaliados × 100 |
| Tempo médio (deslocamento, execução, resolução, atendimento…) | Σ minutos ÷ Σ registros (média ponderada pela quantidade) |
| Taxa de rechamadas | rechamadas confirmadas ÷ serviços técnicos concluídos × 100 |
| Taxa de resolução remota | resolvidos remotamente ÷ atendimentos finalizados × 100 |
| Satisfação | Σ notas ÷ nº de avaliações aprovadas |
| Pendências | **posição do último dia** do período (nunca soma dias) |
| Volumes (recebidas, concluídas, instalações…) | soma dos dias |

Exemplo: dia 1 com 1/1 no SLA e dia 2 com 0/9 → semana = 1/10 = **10%** (a média dos percentuais daria 50%).

## 2. Equipes de campo (fonte: GTSCenter, somente leitura)

**Atribuição à equipe:** pelo `equipeId` do chamado, entre as equipes do GTSCenter vinculadas à unidade **na data** (vigência). A numeração das equipes do GTSCenter não é usada.

| Indicador | Critério |
|---|---|
| O.S. recebidas | `dataAbertura` no dia; status ≠ CANCELADO; **não** encerrada pela gestão (`fechadoAdmin`) |
| O.S. concluídas | status FINALIZADO e `dataFim` no dia; sem `fechadoAdmin` |
| Encerradas pela gestão | FINALIZADO com `fechadoAdmin` (aparecem à parte, fora da produção) |
| Instalações / Manutenções / Suportes / Retiradas | concluídas por `tipo` (instalações e reinstalações separadas — ver §5) |
| O.S. pendentes | abertas até o fim do dia e ainda não finalizadas **naquele momento** (por timestamps; reprocessável). Chamado **agendado para data futura** não é pendência (aparece como "agendado futuro") |
| Motivos de pendência | agendado futuro · cliente ausente · aguardando aprovação · em atendimento · em deslocamento · aguardando início (derivados dos campos do chamado) |
| Visitas improdutivas | `clienteAusente`; dia = `dataACaminho` (senão `dataInicio`). **Aproximado**: o sistema não guarda a data do aviso |
| SLA de resolução / resposta | **lê** `dentroSlaResolucao` / `dentroSlaResposta` já gravados. População = mesma de `calcularSlaDesempenho`: `dataAbertura` no período, não cancelado, sem `fechadoAdmin`; elegível = flag ≠ nulo. Nenhuma regra de SLA é recalculada |
| Rechamadas | só **CONFIRMADA** pelo supervisor; conta para a equipe do **atendimento de origem** (`chamadoOrigemReincidenciaId`), no dia em que a rechamada foi aberta. "Possíveis" aparecem como *a validar* |
| Taxa de rechamadas | base = serviços técnicos concluídos (Instalação, Manutenção, Suporte, Rompimento). **Retirada fica fora da qualidade técnica** |
| Tempo de deslocamento | `dataACaminho` → `dataInicio` (dia do início) |
| Tempo de execução | `dataInicio` → `dataFim` (dia da conclusão) |
| Tempo de resolução | `slaResolucaoMinutos` (o mesmo do SLA) |
| Satisfação | avaliações **APROVADAS** (`AvaliacaoAtendimento`) |

## 3. Recepção (fonte: OPA — depende da documentação e do mapeamento)

Calculada a partir de atendimentos **normalizados**; cada grupo só existe se o campo correspondente foi mapeado (`capacidades`). Sem campo → **Não disponível** (nunca zero).

recebidos (criados no dia) · assumidos (`assumidoEm` no dia) · finalizados (situação finalizada + `finalizadoEm` no dia) · pendentes (criados até o fim do dia e não finalizados; abandonado e situação desconhecida não contam) · transferidos · abandonados · 1ª resposta (`criadoEm`→`primeiraRespostaEm`) · espera (`criadoEm`→`assumidoEm`) · atendimento (`assumidoEm`→`finalizadoEm`) · resolução (`criadoEm`→`finalizadoEm`) · SLA dentro/fora/% · resolução remota · satisfação.

Vendas: `Venda` APROVADA do `Usuario` vinculado ao colaborador. Sem vínculo → não disponível. Retenções, cancelamentos solicitados e falhas de triagem: **sem fonte** → preenchimento manual identificado como manual.

## 4. Metas, dias trabalhados e semáforo

- **Capacidade do dia** (0 a 1): dia fora da operação = 0; ocorrência de *dia não trabalhado* da unidade ou geral = 0; ausência de colaborador reduz proporcionalmente (1 de 2 em férias = 0,5).
- **Meta de volume** (instalações, O.S. concluídas…): Σ dia a dia (capacidade × meta diária equivalente). Meta semanal ÷ dias de operação da semana; mensal ÷ dias de operação do mês.
- **Meta de razão/tempo/pendência** (SLA %, tempos, pendências, rechamadas): comparada direto, sem escala.
- **Precedência da meta:** da unidade > geral; periodicidade mais fina > mais grossa; vigência mais recente.
- **Cumprimento:** maior-melhor = realizado ÷ meta; menor-melhor = meta ÷ realizado (realizado 0 → 100%).
- **Semáforo:** Verde = meta atingida · Amarelo = dentro da faixa de atenção (padrão 10%) · Vermelho = abaixo · Cinza = sem meta ou sem dado.
- **Pontuação 0–100 (opcional):** só existe após o gestor definir pesos **e aprovar** (carimbado pelo servidor). Nota do indicador = cumprimento limitado a 0–100; média ponderada só dos indicadores com meta e dado.

## 5. O que não é classificado pelo GTSCenter

O tipo de chamado só tem Instalação, Manutenção, Retirada, Suporte e Rompimento; a subcategoria está vazia em 100% dos chamados. Portanto **reinstalações, trocas de equipamento e mudanças de endereço** ficam "Não disponível" (preenchimento manual opcional). Nada é inferido de texto livre.

## 6. Comparativo com o período anterior

Alinhado ao calendário quando o período começa no início de uma semana ou de um mês (seg–qua × seg–qua da semana anterior; dia 1–25 × dia 1–25 do mês anterior). Nos demais casos: mesma quantidade de dias imediatamente antes. "Melhorou/Piorou" respeita o sentido (menos tempo/pendência = melhor).

## 7. Oficial × ajustado

O indicador **oficial** nunca é alterado. O **ajustado** desconsidera, em pontualidade/qualidade (SLA, tempos, rechamadas, satisfação), chamados com **ajuste aprovado** pelo gestor, que exige uma ocorrência registrada e motivo. O volume não muda. Tudo auditado.

## 8. Fechamento e revisões

Estados: Em andamento → Aguardando sincronização (faltam dias do OPA) → Aguardando revisão → **Fechado**. Fechar congela números, metas e composição. Fechado não é alterado: correção = **nova revisão** (com motivo); a anterior fica preservada e vira **Revisado** quando a nova é fechada. Histórico de eventos por relatório.
