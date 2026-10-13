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
  {
    id: 'cto', termo: 'CTO',
    definicao: 'Caixa de terminação óptica: a caixa na rua onde saem as fibras que atendem os clientes. No mapa de rede aparece como camada "CTOs".',
    re: /\bctos?\b/,
  },
  {
    id: 'olt-onu', termo: 'OLT e ONU',
    definicao: 'OLT é o equipamento do provedor que "alimenta" a rede óptica; ONU é o equipamento óptico instalado no cliente. O SmartOLT acompanha ambos.',
    re: /\b(olt|onus?)\b/,
  },
  {
    id: 'viabilidade', termo: 'Viabilidade',
    definicao: 'Se um endereço pode ser atendido pela rede. O mapa responde "Tem viabilidade", "Sem viabilidade", "Viabilidade a confirmar" ou "Endereço não encontrado".',
    re: /\bviabilidade\b/,
  },
  {
    id: 'prioridade', termo: 'Prioridade do chamado',
    definicao: 'Urgência da Ordem de Serviço: Normal, Urgente ou Crítico. Chamados críticos e com SLA estourando aparecem nas listas de atenção.',
    re: /\bprioridade\b|\bcritico\b/,
  },
  {
    id: 'os', termo: 'O.S. / despacho',
    definicao: 'Ordem de Serviço: o chamado enviado à equipe. "Novo chamado" abre a "Nova Ordem de Servico" (o despacho), com modalidade, prioridade, endereço e, no EACE, escola e INEP.',
    re: /\b(o\.s\.|o s|ordem de servico|ordens de servico|despacho|despachar)\b/,
  },
  {
    id: 'inep', termo: 'INEP',
    definicao: 'Código da escola atendida nos chamados EACE (campo "INEP" da Ordem de Serviço).',
    re: /\binep\b/,
  },
  {
    id: 'status-chamado', termo: 'Situações do chamado',
    definicao: 'Aberto (aguardando), Agendado (com data/hora marcada), Em atendimento (equipe iniciou), Concluído e Cancelado.',
    re: /\b(situacoes?|status)\b.{0,20}\bchamados?\b|\bchamados?\b.{0,20}\b(situacoes?|status)\b/,
  },
  {
    id: 'status-equipe', termo: 'Status da equipe',
    definicao: 'Disponível (livre para novos chamados), Em deslocamento (a caminho) e Em atividade (atendendo).',
    re: /\b(em deslocamento|em atividade)\b|\bstatus da equipe\b/,
  },
  {
    id: 'gts-empresas', termo: 'GTS Provedor / GTS EACE / GTS Administrativo',
    definicao: 'As três empresas/centros do Financeiro: cada solicitação de pagamento é lançada em uma delas.',
    re: /\b(gts provedor|gts eace|gts administrativo)\b/,
  },
  {
    id: 'perfil', termo: 'Perfil de acesso',
    definicao: 'Define o que cada usuário vê e faz: Administrador, Gestor, Operador NOC, Técnico e Vendedor. É escolhido em Usuarios > "Perfil de Acesso".',
    re: /\b(perfil|perfis|role)\b/,
  },
  {
    id: 'assistente', termo: 'Assistente (Inteligência Operacional)',
    definicao: 'Este chat. Consulta dados reais de operações e estoque e explica como fazer as tarefas nas telas. Ele nunca altera nada no sistema.',
    re: /\b(assistente|inteligencia operacional|orbia)\b/,
  },
]

export const PERGUNTA_DE_DEFINICAO = /\b(como funciona|como funcionam|o que e|oque e|o que sao|o que significa|oque significa|o que quer dizer|quer dizer|significa|significado|defina|definicao|conceito|explique o que|diferenca entre|qual a diferenca)\b/
