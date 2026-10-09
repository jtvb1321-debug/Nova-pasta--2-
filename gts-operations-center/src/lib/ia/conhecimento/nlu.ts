import { GLOSSARIO, PERGUNTA_DE_DEFINICAO, type Termo } from './glossario'
import { GUIAS, TELAS, type Guia } from './guias'

// Interpretacao da pergunta por palavras-chave (sem modelo de IA): descobre se a pessoa quer
// (a) uma definicao, (b) aprender a fazer algo numa tela, (c) saber onde fica uma tela, ou
// (d) um pedido de alteracao - que o assistente nao executa, mas ENSINA a fazer.
// Funcoes puras: sem banco, sem rede.

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const COMO_FAZER = /\b(como (eu |a gente |que |faco para |se )?(faco|fazer|fazemos|posso|podemos|consigo|conseguimos|devo|faz|cadastro|adiciono|registro|lanco|crio|retiro|transfiro|ajusto|dou|vejo|abro|acesso|encontro|emito|gero|exporto|importo|mudo|altero|troco|configuro|aprovo|excluo|apago|volto|uso|usar|funciona)|onde (fica|eu|se|posso|podemos|vejo|encontro|acho|clico|cadastro|registro)|passo a passo|qual (e )?o caminho|me (ensin|expliq|oriente|guie|mostr)\w*|ensine|explique como|tutorial|como usar|nao sei (como|onde))\b/
const INTENCAO = /\b(quero|preciso|gostaria|queria|desejo|necessito|vou|tenho que|tenho de|devo|posso)\b/
const ONDE_TELA = /\b(onde (fica|esta|encontro|acho|vejo|abro)|como (abrir|acessar|chegar|entrar)|qual (a )?tela|em qual (menu|tela|aba)|caminho)\b/
const REGRAS = /\bregras? (de|do|da|para)\b/

const VERBO_CONSULTA = /\b(ver|veja|saber|consultar|consulte|mostrar|mostre|listar|liste|analisar|analise|quanto|quantos|quantas|qual|quais)\b/
const TOM_DADOS = /\b(quantos|quantas|quanto temos|qual o saldo|saldo de|lista|liste|compare|comparar|ranking das|tendencia|consumo|previsao|criticos?)\b/

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
  tipo: 'guia' | 'definicao' | 'tela' | 'escrita-sem-guia' | 'sem-guia'
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

export function listaDeAssuntos(area?: 'estoque' | 'operacoes'): string {
  const guias = GUIAS.filter(g => !area || g.area === area || g.area === 'sistema')
  return guias.map(g => `• ${g.titulo}`).join('\n')
}

/** Monta a resposta de conhecimento (guia, definicao ou tela) ou null se a pergunta e' sobre DADOS. */
export function responderConhecimento(pergunta: string, opcoes: { escrita: boolean; area?: 'estoque' | 'operacoes' }): RespostaConhecimento | null {
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

const COMO_FAZER_EXPLICITO = /\b(como (eu |a gente )?(faco|fazer|posso|podemos|consigo)|passo a passo|me ensin\w*|ensine|tutorial|nao sei (como|onde))\b/

function escolherGuias(lista: { guia: Guia; pontos: number }[], max: number): Guia[] {
  if (lista.length === 0 || lista[0].pontos < PONTOS_MINIMOS) return []
  const topo = lista[0].pontos
  return lista.filter((x, i) => i === 0 || (x.pontos >= PONTOS_MINIMOS && x.pontos >= topo * 0.7)).slice(0, max).map(x => x.guia)
}

/** Guias mais proximos, para sugerir quando nada bate com forca. */
export function sugerirGuias(pergunta: string, max = 3): Guia[] {
  return pontuarGuias(semAcento(pergunta)).slice(0, max).map(x => x.guia)
}
