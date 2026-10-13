import { prisma } from '@/lib/prisma'
import type { AcaoIA, Indicador, Referencia, TabelaIA } from './tipos'

export type AbaIA = 'operacoes' | 'estoque' | 'comercial'
export const ABAS_IA: AbaIA[] = ['operacoes', 'estoque', 'comercial']

// Historico de conversas. Toda leitura filtra pelo usuario dono: um usuario nunca ve conversa de outro.

export const MAX_CONVERSAS_LISTADAS = 30
export const MAX_MENSAGENS_LIDAS = 100

export function tituloDaPergunta(pergunta: string) {
  const t = pergunta.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? `${t.slice(0, 57)}...` : t
}

export async function criarConversa(usuarioId: string, aba: AbaIA, pergunta: string) {
  return prisma.conversaIA.create({ data: { usuarioId, aba, titulo: tituloDaPergunta(pergunta) }, select: { id: true } })
}

export async function conversaDoUsuario(usuarioId: string, conversaId: string) {
  return prisma.conversaIA.findFirst({ where: { id: conversaId, usuarioId }, select: { id: true, aba: true, titulo: true, createdAt: true, updatedAt: true } })
}

export async function listarConversas(usuarioId: string, aba?: AbaIA) {
  return prisma.conversaIA.findMany({
    where: { usuarioId, ...(aba ? { aba } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: MAX_CONVERSAS_LISTADAS,
    select: { id: true, aba: true, titulo: true, updatedAt: true, _count: { select: { mensagens: true } } },
  })
}

export async function lerMensagens(usuarioId: string, conversaId: string) {
  const conversa = await conversaDoUsuario(usuarioId, conversaId)
  if (!conversa) return null
  const mensagens = await prisma.mensagemIA.findMany({
    where: { conversaId },
    orderBy: { createdAt: 'asc' },
    take: MAX_MENSAGENS_LIDAS,
    select: { id: true, papel: true, conteudo: true, indicadores: true, referencias: true, recomendacoes: true, extras: true, provedor: true, modelo: true, simulada: true, erro: true, createdAt: true },
  })
  return { conversa, mensagens }
}

export async function salvarMensagem(dados: {
  conversaId: string
  papel: 'USUARIO' | 'ASSISTENTE'
  conteudo: string
  indicadores?: Indicador[]
  referencias?: Referencia[]
  recomendacoes?: string[]
  extras?: { tabelas?: TabelaIA[]; acoes?: AcaoIA[] }
  provedor?: string
  modelo?: string
  simulada?: boolean
  erro?: string
}) {
  const [msg] = await prisma.$transaction([
    prisma.mensagemIA.create({
      data: {
        conversaId: dados.conversaId, papel: dados.papel, conteudo: dados.conteudo.slice(0, 8000),
        indicadores: dados.indicadores as any, referencias: dados.referencias as any, recomendacoes: dados.recomendacoes as any, extras: dados.extras as any,
        provedor: dados.provedor, modelo: dados.modelo, simulada: dados.simulada ?? false, erro: dados.erro,
      },
      select: { id: true, createdAt: true },
    }),
    prisma.conversaIA.update({ where: { id: dados.conversaId }, data: { updatedAt: new Date() }, select: { id: true } }),
  ])
  return msg
}

/** Ultimas mensagens (so texto) para dar contexto ao modelo. */
export async function historicoParaModelo(usuarioId: string, conversaId: string, max = 6) {
  const conversa = await conversaDoUsuario(usuarioId, conversaId)
  if (!conversa) return []
  const ultimas = await prisma.mensagemIA.findMany({
    where: { conversaId, erro: null },
    orderBy: { createdAt: 'desc' },
    take: max,
    select: { papel: true, conteudo: true },
  })
  return ultimas.reverse().map(m => ({ papel: m.papel, conteudo: m.conteudo.slice(0, 1500) }))
}

export async function excluirConversa(usuarioId: string, conversaId: string) {
  const r = await prisma.conversaIA.deleteMany({ where: { id: conversaId, usuarioId } })
  return r.count > 0
}
