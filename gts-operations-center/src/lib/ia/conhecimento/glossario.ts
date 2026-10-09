// Glossario do sistema: responde "o que e ...?", "o que significa ...?", "qual a diferenca entre ...?".
// Definicoes alinhadas com as regras reais do Orbia (SLA do EACE, reserva x saldo, etc.).

export interface Termo {
  id: string
  termo: string
  definicao: string
  /** Casa com a pergunta SEM acentos e em minusculas. */
  re: RegExp
}

export const GLOSSARIO: Termo[] = [
  {
    id: 'eace', termo: 'EACE',
    definicao: 'Tipo de chamado em que o SLA só começa a contar quando o atendimento é INICIADO (e não na abertura). Por isso o EACE é sempre analisado separado dos chamados convencionais.',
    re: /\beace\b/,
  },
  {
    id: 'convencional', termo: 'Chamado convencional',
    definicao: 'Chamado comum: o SLA conta desde o agendamento/abertura. É sempre mostrado separado do EACE.',
    re: /\bconvencionais?\b/,
  },
  {
    id: 'sla', termo: 'SLA',
    definicao: 'Prazo combinado para atender o chamado. O sistema mostra quantos foram cumpridos no prazo (%) e quantos estouraram, por equipe e por período. Convencional conta pelo agendamento; EACE, pelo início do atendimento.',
    re: /\bsla\b/,
  },
  {
    id: 'saldo-livre', termo: 'Saldo livre',
    definicao: 'Estimativa do que sobra para uso: saldo do estoque menos o que está reservado para chamados. Atenção: a reserva de chamado NÃO baixa o saldo no sistema, por isso é uma estimativa.',
    re: /\bsaldo livre\b|\bsaldo disponivel\b/,
  },
  {
    id: 'reserva', termo: 'Reserva',
    definicao: 'Material separado para um chamado. Não é movimentação física: o saldo só diminui quando há uma retirada/saída.',
    re: /\breservas?\b|\breservad\w+\b/,
  },
  {
    id: 'minimo', termo: 'Estoque mínimo',
    definicao: 'Quantidade abaixo da qual o item entra na lista de reposição. É cadastrado por item; sem mínimo cadastrado o item não entra na análise de reposição.',
    re: /\bestoque minimo\b|\bminimo\b/,
  },
  {
    id: 'ajuste', termo: 'Ajuste de estoque',
    definicao: 'Define a quantidade EXATA de um item (usado em contagem de inventário). Diferente de "Entrada", que soma, e "Saída", que subtrai.',
    re: /\bajustes?\b/,
  },
  {
    id: 'transferencia', termo: 'Transferência',
    definicao: 'Muda a localização do material (entre locais, técnicos ou defeituosos). O total do estoque não muda.',
    re: /\btransferencias?\b/,
  },
  {
    id: 'movimentacao', termo: 'Movimentação',
    definicao: 'Registro de tudo que mexe no estoque: entrada, saída, transferência, reserva e devolução, com data, motivo e responsável.',
    re: /\bmovimentac\w+\b/,
  },
  {
    id: 'devolucao', termo: 'Devolução',
    definicao: 'Material que a equipe devolve ao estoque. Fica pendente até um Administrador aprovar ou rejeitar na aba "Devolucoes".',
    re: /\bdevolu\w+\b/,
  },
  {
    id: 'reversa', termo: 'Reversa / Defeituosos ManINFO',
    definicao: 'Abas para equipamentos que voltam com defeito ou que retornam ao fornecedor (logística reversa).',
    re: /\b(reversa|defeituos\w+|maninfo)\b/,
  },
  {
    id: 'termo', termo: 'Termos GTSNET',
    definicao: 'Termo de responsabilidade do material do carro: permite conferir o veículo da equipe e devolver equipamentos por serial.',
    re: /\btermos?\b/,
  },
  {
    id: 'prestacao', termo: 'Prestação de contas',
    definicao: 'Material entregue a uma equipe que ainda não foi comprovado como usado ou devolvido.',
    re: /\bprestacao de contas\b/,
  },
  {
    id: 'previsao', termo: 'Previsão de reposição',
    definicao: 'Cálculo aproximado do quanto repor, com base no consumo recente e no saldo. É uma estimativa: só sugere quantidade quando há dados suficientes.',
    re: /\bprevisao\b/,
  },
  {
    id: 'equipe-tecnico', termo: 'Equipe x técnico',
    definicao: 'O desempenho e a produtividade são medidos por EQUIPE. O sistema não registra qual técnico executou cada chamado.',
    re: /\btecnicos?\b/,
  },
]

export const PERGUNTA_DE_DEFINICAO = /\b(o que e|oque e|o que sao|o que significa|oque significa|o que quer dizer|quer dizer|significa|significado|defina|definicao|conceito|explique o que|diferenca entre|qual a diferenca)\b/
