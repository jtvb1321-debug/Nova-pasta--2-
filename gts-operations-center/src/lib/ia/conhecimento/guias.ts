// Base de conhecimento do assistente: como FAZER as coisas nas telas do Orbia.
// Os nomes de menus, botoes e janelas abaixo foram conferidos no codigo das telas.
// O assistente nao executa nada: ele explica o caminho. Texto fixo, sem modelo e sem banco.

export interface Sinal {
  /** Casa com a pergunta SEM acentos e em minusculas. */
  re: RegExp
  peso: number
}

export interface Guia {
  id: string
  titulo: string
  area: 'estoque' | 'operacoes' | 'sistema'
  /** Onde a pessoa chega (menu > aba). */
  onde: string
  passos: string[]
  /** Observacoes importantes (permissao, limites). */
  notas?: string[]
  /** Pergunta de DADOS que o assistente sabe responder e que complementa o guia. */
  perguntaRelacionada?: string
  sinais: Sinal[]
}

const s = (re: RegExp, peso = 1): Sinal => ({ re, peso })

export const GUIAS: Guia[] = [
  {
    id: 'estoque-novo-item',
    titulo: 'Cadastrar um item novo / dar entrada de estoque',
    area: 'estoque',
    onde: 'Menu Estoque & Movimentacoes > aba Estoque',
    passos: [
      'Abra o menu "Estoque & Movimentacoes" e fique na aba "Estoque".',
      'Clique em "Novo item". Abre a janela "Novo Item / Entrada de Estoque".',
      'Preencha a descrição, a categoria, a unidade e a quantidade que está entrando.',
      'Informe o "Estoque Mínimo" (quantidade abaixo da qual o item entra na lista de reposição).',
      'Confirme. O item aparece na lista e a entrada fica registrada em "Movimentacoes".',
    ],
    notas: ['Se o item JÁ existe, não cadastre de novo: use "Dar entrada em item que já existe" (ícone de lápis).'],
    perguntaRelacionada: 'Quanto temos de "ONU" em estoque?',
    sinais: [
      s(/\b(adicion\w*|acrescent\w*|cadastr\w*|inclu\w+|inserir|insira|criar|crie|novo|nova|novos)\b.{0,50}\b(item|itens|produto|produtos|material|materiais|equipamento|equipamentos|onu|onus|cabo|cabos|conector\w*)\b/, 3),
      s(/\b(item|itens|produto|material|materiais)\b.{0,30}\b(novo|nova|novos)\b/, 2),
      s(/\bnovo item\b/, 3),
      s(/\bentrada (de|no|do|em)\b.{0,20}\b(estoque|item|material)\b/, 2),
      s(/\b(colocar|botar|lancar)\b.{0,25}\bestoque\b/, 2),
    ],
  },
  {
    id: 'estoque-entrada-existente',
    titulo: 'Dar entrada em um item que já existe',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba Estoque > ícone de lápis ("Ajustar Estoque")',
    passos: [
      'Na aba "Estoque", localize o item (use a busca).',
      'Clique no ícone de lápis da linha do item. Abre "Ajustar Estoque".',
      'Escolha o tipo de operação "Entrada" e informe a quantidade que chegou.',
      'Escreva o motivo (ex.: "compra", "devolução do fornecedor") e confirme.',
    ],
    notas: ['"Entrada" soma à quantidade atual. "Ajuste" define a quantidade EXATA (use para corrigir contagem).'],
    perguntaRelacionada: 'Mostre as movimentações da semana',
    sinais: [
      s(/\b(adicion\w*|acrescent\w*|somar|soma|repor|reposicao|dar entrada|entrada)\b.{0,40}\b(saldo|quantidade|estoque|unidades|itens|item|material)\b/, 2),
      s(/\b(item|itens|material|produto)\b.{0,30}\b(ja existe|existente|cadastrado|que temos)\b/, 2),
      s(/\bdar entrada\b/, 2),
      s(/\b(chegou|chegaram|recebi|recebemos|recebimento)\b/, 2),
    ],
  },
  {
    id: 'estoque-entrada-bipada',
    titulo: 'Dar entrada lendo o código de barras (entrada bipada)',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > botão "Entrada bipada"',
    passos: [
      'Na tela de Estoque, clique em "Entrada bipada" (aparece para Admin e Gestor).',
      'Aponte o leitor para o código de barras de cada produto: cada leitura registra uma unidade.',
      'Revise a lista lida e confirme a entrada.',
    ],
    sinais: [s(/\b(bipad\w*|bipar|bipe|leitor|codigo de barras|cod(igo)? barras|scanner|serial)\b/, 3), s(/\bentrada bipada\b/, 4)],
  },
  {
    id: 'estoque-nota-fiscal',
    titulo: 'Importar uma nota fiscal para dar entrada',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > "Mais ações" > "Importar nota fiscal"',
    passos: [
      'Clique em "Mais ações" e escolha "Importar nota fiscal". Abre "Importar Nota Fiscal (XML/JSON)".',
      'Envie o arquivo XML (ou JSON) da nota.',
      'Confira os itens e quantidades lidos e confirme a importação.',
    ],
    sinais: [s(/\b(nota fiscal|nf|nfe|nf-e|xml|danfe|fornecedor)\b/, 3), s(/\bimportar\b/, 1)],
  },
  {
    id: 'estoque-retirar',
    titulo: 'Retirar material do estoque',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > botão "Retirar material"',
    passos: [
      'Na tela de Estoque, clique em "Retirar material". Abre "Retirar Material do Estoque".',
      'Escolha o item, a quantidade e para quem/qual equipe vai o material.',
      'Informe o motivo e conclua. A saída fica registrada em "Movimentacoes" e no "Histórico de retiradas".',
    ],
    notas: ['A retirada diminui o estoque central. Para só mudar o material de lugar (sem sair do total), use "Transferir material".'],
    perguntaRelacionada: 'Quais equipes têm material pendente de prestação de contas?',
    sinais: [
      s(/\b(retir\w+|tirar|saida|dar saida|baixar|dar baixa|baixa|entreg\w+|levar|pegar|consumir)\b.{0,40}\b(material|materiais|item|itens|estoque|produto|cabo|onu|conector\w*|equipamento)\b/, 3),
      s(/\bretirar material\b/, 4),
      s(/\bsaida de (material|estoque|item)\b/, 3),
    ],
  },
  {
    id: 'estoque-transferir',
    titulo: 'Transferir material entre locais, técnicos ou defeituosos',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > botão "Transferência" (ou "Mais ações" > "Transferir estoque")',
    passos: [
      'Clique em "Transferência". Abre "Transferencia de Estoque".',
      'Escolha o item e a quantidade.',
      'Defina a ORIGEM e o DESTINO (outro local do estoque, um técnico/equipe ou o depósito de defeituosos).',
      'Confirme. O total não muda; só a localização do material.',
    ],
    notas: ['Para vários destinos, faça uma transferência para cada destino (uma por local).'],
    perguntaRelacionada: 'Quais equipes têm material pendente de prestação de contas?',
    sinais: [
      s(/\b(transfir\w*|transfer\w*|mover|mova|movimentar|remanejar|redistribuir|distribuir|distribua|enviar|mandar)\b/, 2),
      s(/\b(deposito|depositos|local|locais|pontos?|lugar|lugares|defeituos\w+|equipe|tecnico|carro)\b/, 1),
      s(/\b(dois|duas|2|varios|varias|diferentes)\b.{0,20}\b(pontos?|locais|depositos|lugares)\b/, 2),
    ],
  },
  {
    id: 'estoque-ajustar',
    titulo: 'Corrigir a quantidade (ajuste / contagem de inventário)',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba Estoque > ícone de lápis ("Ajustar Estoque")',
    passos: [
      'Na aba "Estoque", clique no lápis da linha do item. Abre "Ajustar Estoque".',
      'Escolha o tipo "Ajuste": ele define a quantidade EXATA que existe de verdade.',
      'Digite a quantidade contada, escreva o motivo (ex.: "contagem de inventário") e confirme.',
    ],
    notas: ['O ajuste fica registrado em "Movimentacoes" com o motivo, para auditoria.'],
    sinais: [
      s(/\b(ajust\w+|corrig\w+|acert\w+|inventario|contagem|recontagem|quantidade exata|zerar|zere)\b/, 3),
      s(/\b(atualiz\w+|alter\w+|mud\w+|troc\w+)\b.{0,30}\b(saldo|quantidade)\b/, 3),
      s(/\b(saldo|quantidade)\b.{0,30}\b(errad\w+|diferente|divergent\w+|nao bate|incorret\w+)\b/, 3),
    ],
  },
  {
    id: 'estoque-minimo',
    titulo: 'Definir o estoque mínimo (alerta de reposição)',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba Estoque > "Novo item" (campo "Estoque Mínimo")',
    passos: [
      'O mínimo é definido ao cadastrar o item, no campo "Estoque Mínimo" da janela "Novo Item / Entrada de Estoque".',
      'Itens com saldo abaixo do mínimo aparecem como alerta na lista de Estoque.',
    ],
    notas: ['Itens sem mínimo cadastrado não entram na análise de reposição (eu não invento um mínimo).'],
    perguntaRelacionada: 'Quais materiais precisamos repor?',
    sinais: [s(/\b(estoque minimo|minimo)\b/, 3), s(/\b(alerta|ponto) de (reposicao|compra)\b/, 3), s(/\bdefinir\b.{0,20}\bminimo\b/, 3)],
  },
  {
    id: 'estoque-devolucao',
    titulo: 'Registrar e aprovar devoluções',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba "Devolucoes"',
    passos: [
      'Abra a aba "Devolucoes".',
      'As devoluções enviadas pelas equipes aparecem como pendentes.',
      'Quem tem perfil Administrador aprova ou rejeita cada uma; ao aprovar, o material volta ao estoque.',
    ],
    notas: ['Aprovar/rejeitar devolução é só para Administrador. Defeitos e retorno ao fornecedor ficam em "Defeituosos ManINFO" e "Reversa ManINFO".'],
    perguntaRelacionada: 'Há devoluções aguardando aprovação?',
    sinais: [s(/\bdevol\w+\b/, 3), s(/\b(reversa|defeituos\w+|defeito|maninfo|garantia)\b/, 2)],
  },
  {
    id: 'estoque-por-tecnico',
    titulo: 'Ver material que está com cada técnico/equipe e dar baixa',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba "Por Tecnico"',
    passos: [
      'Abra a aba "Por Tecnico" para ver o que cada equipe/técnico carrega.',
      'Para dar baixa em um material que foi usado, abra a linha do item, informe a quantidade e o motivo e confirme ("Baixa confirmada!").',
    ],
    perguntaRelacionada: 'Quais equipes têm material pendente de prestação de contas?',
    sinais: [s(/\b(por tecnico|com o tecnico|do tecnico|material do (tecnico|carro|equipe))\b/, 3), s(/\bcarro\b/, 1), s(/\b(prestacao de contas|pendente de prestacao)\b/, 3)],
  },
  {
    id: 'estoque-termos',
    titulo: 'Conferir o carro e devolver por serial (Termos GTSNET)',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba "Termos GTSNET"',
    passos: [
      'Abra a aba "Termos GTSNET".',
      'Escolha a equipe e clique em "Conferir carro" para conferir o que está no veículo.',
      'Para devolver equipamentos, clique em "Devolver por serial" e leia/digite os seriais.',
    ],
    sinais: [s(/\b(termo|termos|gtsnet|conferir|conferencia)\b/, 3), s(/\bconferir (o )?carro\b/, 4), s(/\bdevolver por serial\b/, 4)],
  },
  {
    id: 'estoque-excluir',
    titulo: 'Excluir um item do estoque',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > aba Estoque > ícone de lixeira (só Administrador)',
    passos: [
      'Na aba "Estoque", clique na lixeira da linha do item ("Excluir item (somente admin)").',
      'Confirme na janela "Excluir item do estoque".',
    ],
    notas: ['Só o perfil Administrador vê a lixeira. Prefira "Ajuste" para zerar saldo, pois a exclusão apaga o cadastro.'],
    sinais: [s(/\b(exclu\w+|apag\w+|delet\w+|remov\w+|deletar|lixeira)\b.{0,40}\b(item|itens|produto|estoque|material|cadastro)\b/, 4)],
  },
  {
    id: 'estoque-relatorios',
    titulo: 'Exportar o estoque, baixar relatório e ver histórico de retiradas',
    area: 'estoque',
    onde: 'Estoque & Movimentacoes > "Mais ações"',
    passos: [
      'Clique em "Mais ações".',
      '"Exportar" gera a lista do estoque; "Baixar relatório" gera o relatório completo; "Histórico de retiradas" mostra quem retirou o quê.',
    ],
    sinais: [s(/\b(exportar|exporte|relatorio|planilha|excel|csv|baixar relatorio|historico de retiradas|historico)\b/, 3)],
  },
  {
    id: 'estoque-solicitacao',
    titulo: 'Solicitações de material das equipes',
    area: 'estoque',
    onde: 'Menu Operacional > Solicitacoes de Equipe',
    passos: [
      'Abra "Solicitacoes de Equipe" no menu Operacional.',
      'Veja os pedidos de material feitos pelas equipes e responda cada um.',
    ],
    sinais: [s(/\bsolicit\w+\b/, 3), s(/\bpedido de material\b/, 3)],
  },
  {
    id: 'chamado-novo',
    titulo: 'Abrir um chamado novo',
    area: 'operacoes',
    onde: 'Menu Operacional > Chamados > botão "Novo chamado"',
    passos: [
      'Abra "Chamados" no menu Operacional.',
      'Clique em "Novo chamado" (abre o despacho).',
      'Informe o cliente/endereço, o tipo de serviço, a equipe e o horário e confirme.',
    ],
    notas: ['O SLA do chamado passa a contar conforme o tipo (no EACE só começa no início do atendimento).'],
    perguntaRelacionada: 'Como está a operação hoje?',
    sinais: [
      s(/\b(abrir|abra|criar|crie|novo|nova|despachar|despacho|agendar|agende|lancar|registrar|registre)\b.{0,40}\b(chamado|chamados|os|ordem de servico|atendimento|instalacao|visita)\b/, 4),
      s(/\bnovo chamado\b/, 4),
    ],
  },
  {
    id: 'sla-desempenho',
    titulo: 'Ver o SLA e o desempenho das equipes',
    area: 'operacoes',
    onde: 'Menu Operacional > Desempenho das Equipes > aba "SLA"',
    passos: [
      'Abra "Desempenho das Equipes".',
      'Escolha o período no topo: Hoje, Esta semana, Este mês, Mês anterior ou Personalizado.',
      'Use a aba "SLA" para ver o cumprimento por equipe.',
    ],
    notas: ['Aqui no chat você pode perguntar direto, por exemplo: "Como está o SLA neste mês?".'],
    perguntaRelacionada: 'Como está o SLA neste mês?',
    sinais: [s(/\b(desempenho|ranking|painel de sla|tela de sla)\b/, 3), s(/\bsla\b.{0,30}\b(onde|tela|ver|abrir)\b/, 2)],
  },
  {
    id: 'avaliacoes',
    titulo: 'Ver as avaliações dos clientes',
    area: 'operacoes',
    onde: 'Desempenho das Equipes > "Avaliações"',
    passos: ['Abra "Desempenho das Equipes" e entre na subaba "Avaliações".', 'As notas chegam pelo QR/WhatsApp enviado ao cliente no fim do chamado.'],
    sinais: [s(/\b(avalia\w+|nota do cliente|nps|satisfacao|qr)\b/, 3)],
  },
  {
    id: 'bonificacao',
    titulo: 'Ranking e bonificação',
    area: 'operacoes',
    onde: 'Desempenho das Equipes > "Ranking e bonificação" (Administrador)',
    passos: ['Abra "Desempenho das Equipes" e entre em "Ranking e bonificação".', 'Escolha o período e confira a classificação e o valor por equipe.'],
    notas: ['Essa subaba é só para Administrador.'],
    sinais: [s(/\b(bonific\w+|bonus|premiacao|premio)\b/, 4)],
  },
  {
    id: 'equipe-renomear',
    titulo: 'Criar, renomear ou mudar equipes',
    area: 'operacoes',
    onde: 'Menu Operacional > Equipes',
    passos: [
      'Abra "Equipes" para ver as equipes e seus integrantes.',
      'Hoje não existe tela para renomear uma equipe: o nome é ajustado diretamente pela equipe técnica (TI). Solicite a mudança a ela.',
    ],
    sinais: [s(/\b(cadastr\w+|cri\w+|adicion\w+|inclu\w+)\b.{0,15}\bequipes?\b/, 4), s(/\b(renom\w+|trocar o nome|mudar o nome|nome da equipe|criar equipe|nova equipe|cadastrar equipe)\b/, 4), s(/\bequipes?\b.{0,20}\b(nome|renom\w+)\b/, 3)],
  },
  {
    id: 'usuarios',
    titulo: 'Criar usuário, trocar senha ou perfil',
    area: 'sistema',
    onde: 'Menu Sistema > Usuarios',
    passos: [
      'Abra "Usuarios" no menu Sistema (só quem tem permissão de editar usuários vê o menu).',
      'Clique em editar no usuário desejado para trocar senha, perfil ou equipe; ou crie um novo usuário.',
    ],
    notas: ['Eu nunca mostro nem peço senhas.'],
    sinais: [s(/\b(usuario|usuarios|senha|perfil|permissao|permissoes|acesso|login)\b/, 3)],
  },
  {
    id: 'horas-extras',
    titulo: 'Horas extras',
    area: 'operacoes',
    onde: 'Menu Operacional > Horas Extras',
    passos: ['Abra "Horas Extras" no menu Operacional para lançar e acompanhar as horas.'],
    sinais: [s(/\bhoras? extras?\b/, 4)],
  },
]

/** Telas do menu: respondem "onde fica X?". */
export const TELAS: { nome: string; caminho: string; re: RegExp }[] = [
  { nome: 'Dashboard', caminho: 'Menu Geral > Dashboard', re: /\bdashboard\b|\bpainel geral\b/ },
  { nome: 'Chamados', caminho: 'Menu Operacional > Chamados', re: /\bchamados?\b|\bagenda\b/ },
  { nome: 'Equipes', caminho: 'Menu Operacional > Equipes', re: /\bequipes?\b/ },
  { nome: 'Desempenho das Equipes', caminho: 'Menu Operacional > Desempenho das Equipes', re: /\bdesempenho\b/ },
  { nome: 'Inteligência Operacional', caminho: 'Menu Operacional > Inteligência Operacional (esta tela)', re: /\binteligencia\b|\bassistente\b/ },
  { nome: 'Solicitações de Equipe', caminho: 'Menu Operacional > Solicitacoes de Equipe', re: /\bsolicita\w+\b/ },
  { nome: 'Horas Extras', caminho: 'Menu Operacional > Horas Extras', re: /\bhoras? extras?\b/ },
  { nome: 'Mapa & Veículos', caminho: 'Menu Monitoramento > Mapa & Veiculos', re: /\b(mapa|veiculos?|rastreamento)\b/ },
  { nome: 'SmartOLT', caminho: 'Menu Monitoramento > SmartOLT', re: /\bsmartolt\b|\bolt\b/ },
  { nome: 'Clientes Dedicados', caminho: 'Menu Monitoramento > Clientes Dedicados', re: /\b(dedicados?|link dedicado)\b/ },
  { nome: 'Combustível', caminho: 'Menu Monitoramento > Combustivel', re: /\bcombustivel\b/ },
  { nome: 'Estoque & Movimentações', caminho: 'Menu Estoque > Estoque & Movimentacoes', re: /\b(estoque|movimentacoes?)\b/ },
  { nome: 'Vendas', caminho: 'Menu Comercial > Vendas', re: /\bvendas?\b/ },
  { nome: 'Clientes', caminho: 'Menu Comercial > Clientes', re: /\bclientes?\b/ },
  { nome: 'Financeiro', caminho: 'Menu Comercial > Financeiro', re: /\bfinanceiro\b/ },
  { nome: 'Relatórios', caminho: 'Menu Comercial > Relatorios', re: /\brelatorios?\b/ },
  { nome: 'Usuários', caminho: 'Menu Sistema > Usuarios', re: /\busuarios?\b/ },
  { nome: 'Auditoria', caminho: 'Menu Sistema > Auditoria', re: /\bauditoria\b|\blogs?\b/ },
  { nome: 'Modo TV', caminho: 'Menu Sistema > Modo TV', re: /\b(modo tv|tv)\b/ },
  { nome: 'Configurações', caminho: 'Menu Sistema > Configuracoes', re: /\bconfigura\w+\b/ },
]
