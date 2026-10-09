// Protecoes do assistente: entrada, prompt injection, dados pessoais e segredos.
// Funcoes puras, sem banco - testadas isoladamente.

const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g

export class ErroEntrada extends Error {
  constructor(public codigo: 'VAZIA' | 'LONGA', mensagem: string) {
    super(mensagem)
    this.name = 'ErroEntrada'
  }
}

/** Normaliza a pergunta do usuario: sem caracteres de controle/invisiveis, espacos colapsados, tamanho limitado. */
export function limparEntrada(bruto: unknown, max: number): string {
  if (typeof bruto !== 'string') throw new ErroEntrada('VAZIA', 'Escreva uma pergunta.')
  const texto = bruto.normalize('NFKC').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim()
  if (!texto) throw new ErroEntrada('VAZIA', 'Escreva uma pergunta.')
  if (texto.length > max) throw new ErroEntrada('LONGA', `A pergunta passa de ${max} caracteres. Resuma e tente de novo.`)
  return texto
}

// Padroes de tentativa de mudar as regras do assistente, extrair o prompt ou pedir escrita/SQL.
// Aplicados sobre o texto SEM acentos e em minusculas (o \b do JavaScript nao entende letras acentuadas).
// Sao deliberadamente especificos para nao barrar perguntas normais de gestao.
const PADROES_INJECAO: { motivo: string; re: RegExp }[] = [
  {
    motivo: 'ignorar instrucoes',
    re: /\b(ignore|ignora|ignorar|desconsidere|esqueca|descarte|disregard|forget)\b.{0,40}\b(instrucoes|regras|prompt|diretrizes|instructions|rules|guidelines|previous)\b/,
  },
  {
    motivo: 'revelar prompt',
    re: /\b(revele|mostre|exiba|imprima|repita|reveal|show|print|repeat|leak)\b.{0,40}\b(prompt|instrucoes (do )?sistema|system prompt|mensagem de sistema|system message)\b/,
  },
  {
    motivo: 'trocar de papel',
    re: /\b(voce agora e|a partir de agora voce|finja (ser|que)|aja como|act as|you are now|pretend (to be|you))\b/,
  },
  {
    motivo: 'marcadores de papel',
    re: /(<\|?\s*(im_start|im_end|system|assistant|endoftext)\s*\|?>|\[\/?inst\]|###\s*(system|instruction)|begin (system|prompt))/,
  },
  {
    motivo: 'sql ou comando',
    re: /\b(drop\s+table|delete\s+from|truncate\s+table|update\s+\w+\s+set|insert\s+into|alter\s+table|union\s+select|exec(ute)?\s+(sql|xp_))\b|;\s*--/,
  },
  {
    motivo: 'pedido de escrita',
    re: /\b(apague|exclua|delete|remova|de baixa|dar baixa|transfira|transferir|compre|comprar|efetue (a )?compra|altere o estoque|ajuste o estoque|zere o estoque|adicione|adicionar|acrescente|acrescentar|cadastre|cadastrar|crie|criar|insira|inserir|lance|lancar|registre|registrar|atualize|atualizar|altere|alterar|mova|mover|devolva|materialize|efetive)\b.{0,60}\b(estoque|item|itens|produto|material|materiais|chamado|equipamento|saldo|banco|tabela|conectores?|onus?|pedido|deposito|depositos)\b/,
  },
  {
    motivo: 'credenciais',
    re: /\b(api[\s_-]?key|chave da api|senha|password|token|segredo|secret|credenciais?)\b.{0,40}\b(mostre|revele|exiba|qual|envie|liste|show|reveal|print)\b|\b(mostre|revele|exiba|qual e|envie|liste|show|reveal|print)\b.{0,40}\b(api[\s_-]?key|chave da api|senha|password|token|segredo|secret|credenciais?)\b|\.env\b/,
  },
]

export interface AvaliacaoInjecao {
  suspeita: boolean
  motivos: string[]
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function detectarInjecao(texto: string): AvaliacaoInjecao {
  const t = semAcento(texto)
  const motivos = PADROES_INJECAO.filter(p => p.re.test(t)).map(p => p.motivo)
  return { suspeita: motivos.length > 0, motivos }
}

/**
 * Texto livre vindo do banco (motivos, observacoes, descricoes) pode ter sido escrito por qualquer pessoa.
 * Antes de ir para o modelo: sem controle, curto e com instrucoes suspeitas removidas.
 */
export function neutralizarTexto(bruto: unknown, max = 120): string | null {
  if (bruto == null) return null
  let t = String(bruto).normalize('NFKC').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (detectarInjecao(t).suspeita) return '[conteudo removido por seguranca]'
  if (t.length > max) t = `${t.slice(0, max - 1)}…`
  return t
}

const TELEFONE = /(?<!\d)(\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g
const CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g
const CNPJ = /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Mascara dados pessoais que nao precisam chegar ao provedor de IA. */
export function removerDadosPessoais(texto: string): string {
  return texto.replace(EMAIL, '[email]').replace(CNPJ, '[cnpj]').replace(CPF, '[cpf]').replace(TELEFONE, '[telefone]')
}

const PADROES_SEGREDO = [
  /sk-or-v1-[A-Za-z0-9]{16,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
]

/** Remove segredos conhecidos e padroes de chave de qualquer texto que va para log, resposta ou erro. */
export function ocultarSegredos(texto: string, segredos: (string | null | undefined)[] = []): string {
  let t = texto
  for (const s of segredos) if (s && s.length >= 8) t = t.split(s).join('[segredo]')
  for (const re of PADROES_SEGREDO) t = t.replace(re, '[segredo]')
  return t
}

/** Resposta do modelo antes de mostrar: sem segredos, sem HTML/scripts, tamanho limitado. */
export function limparRespostaModelo(texto: string, segredos: (string | null | undefined)[] = [], max = 6000): string {
  let t = ocultarSegredos(texto, segredos).replace(CONTROLE, ' ')
  t = t.replace(/<\s*(script|iframe|style|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/<\/?[a-z][^>]*>/gi, '')
  t = t.replace(/\n{3,}/g, '\n\n').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Mensagem fixa usada quando a pergunta tenta mudar as regras do assistente. */
export const RESPOSTA_INJECAO =
  'Não posso atender esse pedido. Este assistente só consulta dados autorizados de operações e estoque e não altera nada no sistema. ' +
  'Reformule a pergunta sobre chamados, equipes, SLA ou materiais.'
