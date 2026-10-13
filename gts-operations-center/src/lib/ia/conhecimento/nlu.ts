import { GLOSSARIO, PERGUNTA_DE_DEFINICAO, type Termo } from './glossario'
import { GUIAS, TELAS, type Guia } from './guias'

// Interpretacao da pergunta por palavras-chave (sem modelo de IA): descobre se a pessoa quer
// (a) uma definicao, (b) aprender a fazer algo numa tela, (c) saber onde fica uma tela, ou
// (d) um pedido de alteracao - que o assistente nao executa, mas ENSINA a fazer.
// Funcoes puras: sem banco, sem rede.

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const COMO_FAZER = /\b(como(?! (o|a|os|as|um|uma|esta|estao|estava|foi|foram|ficou|ficaram|anda|andam|vai|vao|sera|tem|temos|e|sao|era|vem|evoluiu|evoluiram|variou)\b) (eu |a gente |que |se |faco para )?\w+|onde (?!esta\b|estao\b)(fica|ficam|eu|se|posso|podemos|vejo|encontro|acho|clico|cadastro|registro|coloco|lanco|digito|informo|\w+ o\b)|passo a passo|qual (e )?o caminho|me (ensin|expliq|oriente|guie|mostr)\w*|ensine|explique como|tutorial|nao sei (como|onde)|em qual (menu|tela|aba))\b/
const INTENCAO = /\b(quero|preciso|gostaria|queria|desejo|necessito|vou|tenho que|tenho de|devo|posso)\b/
const ONDE_TELA = /\b(onde (fica|esta|encontro|acho|vejo|abro)|como (abrir|acessar|chegar|entrar)|qual (a )?tela|em qual (menu|tela|aba)|caminho)\b/
const REGRAS = /\bregras? (de|do|da|para)\b/

const VERBO_CONSULTA = /\b(ver|veja|saber|consultar|consulte|mostrar|mostre|listar|liste|analisar|analise|quanto|quantos|quantas|qual|quais)\b/
const TOM_DADOS = /\b(quantos|quantas|quanto temos|qual o saldo|saldo de|lista|liste|compare|compar\w+|produtiv\w+|metas?|pendentes|movimentac\w+|ranking das|tendencia|consumo|previsao|criticos?)\b/

export interface Classificacao {
  textoLimpo: string
  definicao: boolean
  comoFazer: boolean
  /** So disse "quero/preciso..." sem pedir passo a passo. */
  intencao: boolean
  ondeTela: boolean
  guias: { guia: Guia; pontos: number }[]
  termos: Termo[]
}

export function pontuarGuias(textoSemAcento: string): { guia: Guia; pontos: number }[] {
  return GUIAS
    .map(guia => ({ guia, pontos: guia.sinais.reduce((acc, sg) => acc + (sg.re.test(textoSemAcento) ? sg.peso : 0), 0) }))
    .filter(x => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
}

export function classificar(pergunta: string): Classificacao {
  const t = semAcento(pergunta)
  const definicao = PERGUNTA_DE_DEFINICAO.test(t) || REGRAS.test(t)
  return {
    textoLimpo: t,
    definicao,
    comoFazer: COMO_FAZER.test(t),
    intencao: INTENCAO.test(t) && !VERBO_CONSULTA.test(t) && !TOM_DADOS.test(t),
    ondeTela: ONDE_TELA.test(t),
    guias: pontuarGuias(t),
    termos: definicao ? GLOSSARIO.filter(g => g.re.test(t)) : [],
  }
}

const PONTOS_MINIMOS = 3

export interface RespostaConhecimento {
  tipo: 'guia' | 'definicao' | 'tela' | 'escrita-sem-guia' | 'sem-guia' | 'ajuda'
  texto: string
  recomendacoes: string[]
}

const AVISO_ESCRITA = 'Eu só consulto dados: não altero estoque, chamados nem nada no sistema. Mas você (ou quem tiver permissão) faz isso na tela assim:'

function formatarGuia(g: Guia): { texto: string; sugestao?: string } {
  const passos = g.passos.map((p, i) => `${i + 1}. ${p}`).join('\n')
  const notas = g.notas?.length ? `\n\nObservações:\n${g.notas.map(n => `• ${n}`).join('\n')}` : ''
  return {
    texto: `${g.titulo}\nOnde: ${g.onde}\n\n${passos}${notas}`,
    sugestao: g.perguntaRelacionada ? `Para ver os dados no chat, pergunte: ${g.perguntaRelacionada}` : undefined,
  }
}

const NOME_AREA: Record<Guia['area'], string> = { estoque: 'Estoque', operacoes: 'Chamados, equipes e monitoramento', sistema: 'Sistema, vendas e financeiro' }

export type AreaAssistente = 'estoque' | 'operacoes' | 'comercial'

export function listaDeAssuntos(area?: AreaAssistente): string {
  const ordem: Guia['area'][] = area === 'operacoes' ? ['operacoes', 'estoque', 'sistema'] : area === 'comercial' ? ['sistema', 'operacoes', 'estoque'] : ['estoque', 'operacoes', 'sistema']
  return ordem
    .map(a => `${NOME_AREA[a]}:\n${GUIAS.filter(g => g.area === a).map(g => `• ${g.titulo}`).join('\n')}`)
    .join('\n\n')
}

const AJUDA = /\b(o ?que (voce|vc|tu) (pode|consegue|faz|sabe)|o ?que posso (perguntar|fazer)|ajuda|me ajud\w+|menu|comandos?|como funciona|ola|oi|bom dia|boa tarde|boa noite)\b/

const EXEMPLOS_DADOS: Record<AreaAssistente, string[]> = {
  comercial: ['Como foram as vendas deste mês? Quem mais vendeu?', 'Vendas do mês anterior', 'Compare as vendas de agosto', 'Quantos cancelamentos tivemos neste mês no IXC?', 'Quantos cancelamentos no mês passado? Compare com o anterior'],
  operacoes: ['Como está a operação hoje?', 'Quais chamados estão críticos agora?', 'Como está o SLA neste mês?', 'Compare as equipes no mês anterior', 'Qual a produtividade dos últimos 30 dias?', 'Quais atendimentos estão pendentes?', 'Quantos chamados de recolhimento foram feitos e por qual equipe?', 'Qual equipe tem o maior índice de chamados concluídos?', 'Quais clientes têm mais rechamadas?'],
  estoque: ['Quais materiais precisamos repor?', 'Quanto temos de "ONU" em estoque?', 'Mostre as movimentações da semana', 'Há devoluções aguardando aprovação?', 'Faça uma previsão de reposição para 30 dias', 'Onde está o equipamento AA:BB:CC:00:00:01?'],
}

const ROTULO_AREA: Record<AreaAssistente, string> = { estoque: 'Estoque', operacoes: 'Operações', comercial: 'Comercial' }

function respostaAjuda(area: AreaAssistente = 'operacoes'): RespostaConhecimento {
  return {
    tipo: 'ajuda',
    texto: [
      'Olá! Eu sou o assistente do Orbia. Eu só CONSULTO: não altero estoque, chamados nem nada no sistema. Posso:',
      '',
      `1. Consultar dados reais (${ROTULO_AREA[area]}). Exemplos:`,
      ...EXEMPLOS_DADOS[area].map(e => `• ${e}`),
      '(Para outros assuntos de dados — Operações, Estoque ou Comercial — troque a aba acima.)',
      '',
      '2. Ensinar a fazer as tarefas nas telas (pergunte "como faço para..."):',
      listaDeAssuntos(area),
      '',
      '3. Explicar termos do sistema (ex.: "o que é EACE?", "o que é saldo livre?").',
    ].join('\n'),
    recomendacoes: [],
  }
}

/** Monta a resposta de conhecimento (guia, definicao ou tela) ou null se a pergunta e' sobre DADOS. */
export function responderConhecimento(pergunta: string, opcoes: { escrita: boolean; area?: AreaAssistente }): RespostaConhecimento | null {
  const c = classificar(pergunta)

  // 1) Pedido de alteracao: nao executa, mas ensina o caminho.
  if (opcoes.escrita) {
    const escolhidos = escolherGuias(c.guias, 2)
    if (escolhidos.length > 0) {
      const partes = escolhidos.map(formatarGuia)
      return {
        tipo: 'guia',
        texto: `${c.comoFazer ? '' : `${AVISO_ESCRITA}\n\n`}${partes.map(p => p.texto).join('\n\n———\n\n')}`,
        recomendacoes: partes.flatMap(p => (p.sugestao ? [p.sugestao] : [])).slice(0, 2),
      }
    }
    return {
      tipo: 'escrita-sem-guia',
      texto: `${AVISO_ESCRITA.replace(' assim:', '')}\n\nNão entendi exatamente o que você quer fazer. Diga com outras palavras (por exemplo: "como dar entrada de material", "como retirar material", "como transferir estoque") e eu explico o passo a passo. Assuntos que eu sei ensinar:\n${listaDeAssuntos(opcoes.area)}`,
      recomendacoes: [],
    }
  }

  // 2) Definicao ("o que e EACE?")
  if (c.definicao && c.termos.length > 0) {
    const termos = c.termos.slice(0, 2)
    return { tipo: 'definicao', texto: termos.map(t => `${t.termo}: ${t.definicao}`).join('\n\n'), recomendacoes: [] }
  }

  // 2b) Pedido de ajuda / cumprimento, sem assunto especifico: apresenta o que sabe fazer.
  if (AJUDA.test(c.textoLimpo) && escolherGuias(c.guias, 1).length === 0) return respostaAjuda(opcoes.area)

  // 3) Como fazer / onde fica
  if (c.comoFazer || c.ondeTela || c.intencao) {
    const escolhidos = escolherGuias(c.guias, 2)
    if (escolhidos.length > 0 && !(c.ondeTela && !c.comoFazer && c.guias[0].pontos < PONTOS_MINIMOS + 1)) {
      const partes = escolhidos.map(formatarGuia)
      return { tipo: 'guia', texto: partes.map(p => p.texto).join('\n\n———\n\n'), recomendacoes: partes.flatMap(p => (p.sugestao ? [p.sugestao] : [])).slice(0, 2) }
    }
    if (c.ondeTela) {
      const telas = TELAS.filter(x => x.re.test(c.textoLimpo)).slice(0, 3)
      if (telas.length > 0) return { tipo: 'tela', texto: telas.map(x => `${x.nome} fica em: ${x.caminho}.`).join('\n'), recomendacoes: [] }
    }
    // A pergunta parece de dados ("como esta o SLA", "quanto temos")? deixa seguir para as consultas.
    if (TOM_DADOS.test(c.textoLimpo) || /\bcomo esta\b/.test(c.textoLimpo)) return null
    if (COMO_FAZER_EXPLICITO.test(c.textoLimpo)) {
      return { tipo: 'sem-guia', texto: `Ainda não tenho o passo a passo desse assunto. Eu sei explicar:\n${listaDeAssuntos(opcoes.area)}\n\nTambém respondo dúvidas de termos (ex.: "o que é EACE?") e consulto dados (ex.: "como está o SLA neste mês?").`, recomendacoes: [] }
    }
  }
  return null
}

const COMO_FAZER_EXPLICITO = /\b(como(?! (o|a|os|as|um|uma|esta|estao|estava|foi|foram|ficou|ficaram|anda|andam|vai|vao|sera|tem|temos|e|sao|era|vem|evoluiu|evoluiram|variou)\b) (eu |a gente )?\w+|passo a passo|me ensin\w*|ensine|tutorial|nao sei (como|onde))\b/

function escolherGuias(lista: { guia: Guia; pontos: number }[], max: number): Guia[] {
  if (lista.length === 0 || lista[0].pontos < PONTOS_MINIMOS) return []
  const topo = lista[0].pontos
  return lista.filter((x, i) => i === 0 || (x.pontos >= PONTOS_MINIMOS && x.pontos >= topo * 0.7)).slice(0, max).map(x => x.guia)
}

/** Guias mais proximos, para sugerir quando nada bate com forca. */
export function sugerirGuias(pergunta: string, max = 3): Guia[] {
  return pontuarGuias(semAcento(pergunta)).slice(0, max).map(x => x.guia)
}
