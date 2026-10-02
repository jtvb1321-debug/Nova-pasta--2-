import { randomBytes } from 'crypto'
import { prisma } from './prisma'

export const VALIDADE_AVALIACAO_DIAS = 7
// Acima disso o mesmo IP avaliando varios chamados no periodo vira alerta na
// auditoria (ex: equipe respondendo a pesquisa pelo proprio celular).
const LIMITE_AVALIACOES_MESMO_IP = 3
const JANELA_MESMO_IP_DIAS = 30

export type OrigemAvaliacao = 'QR' | 'WHATSAPP'

function gerarToken() {
  return randomBytes(18).toString('base64url')
}

// Uma avaliacao por chamado (chamadoId e' unico). Chamado de novo (job do
// WhatsApp, reenvio) devolve a mesma - o QR e o link do WhatsApp sempre
// apontam para o mesmo registro.
export async function garantirAvaliacao(chamadoId: string, ipFinalizacao?: string | null) {
  const existente = await prisma.avaliacaoAtendimento.findUnique({ where: { chamadoId } })
  if (existente) return existente

  try {
    return await prisma.avaliacaoAtendimento.create({
      data: {
        chamadoId,
        token: gerarToken(),
        expiraEm: new Date(Date.now() + VALIDADE_AVALIACAO_DIAS * 24 * 60 * 60 * 1000),
        ipFinalizacao: ipFinalizacao ?? null,
      },
    })
  } catch (erro: any) {
    // Duas finalizacoes/envios concorrentes criando ao mesmo tempo - a outra
    // venceu a corrida, reaproveita a dela.
    if (erro?.code === 'P2002') {
      return prisma.avaliacaoAtendimento.findUniqueOrThrow({ where: { chamadoId } })
    }
    throw erro
  }
}

export function urlAvaliacao(token: string, origem: OrigemAvaliacao) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  return `${base}/avaliar/${token}?origem=${origem === 'QR' ? 'qr' : 'whatsapp'}`
}

export function avaliacaoDisponivel(av: { respondidoEm: Date | null; expiraEm: Date }) {
  if (av.respondidoEm) return 'RESPONDIDA' as const
  if (av.expiraEm.getTime() < Date.now()) return 'EXPIRADA' as const
  return 'PENDENTE' as const
}

export async function registrarAcessoAvaliacao(token: string, ip: string, userAgent: string | null) {
  const av = await prisma.avaliacaoAtendimento.findUnique({ where: { token } })
  if (!av) return null

  await prisma.avaliacaoAtendimento.update({
    where: { id: av.id },
    data: {
      acessos: { increment: 1 },
      ...(av.primeiroAcessoEm
        ? {}
        : { primeiroAcessoEm: new Date(), primeiroAcessoIp: ip, primeiroAcessoUserAgent: userAgent }),
    },
  })
  return av
}

// Gravacao condicional (so se ainda nao respondida e dentro da validade) -
// e' o que impede duas respostas para o mesmo chamado, mesmo com o QR e o
// link do WhatsApp sendo usados ao mesmo tempo.
export async function registrarRespostaAvaliacao(dados: {
  token: string
  nota: number
  problemaResolvido: 'SIM' | 'PARCIAL' | 'NAO'
  comentario?: string | null
  origem: OrigemAvaliacao
  ip: string
  userAgent: string | null
}) {
  const resultado = await prisma.avaliacaoAtendimento.updateMany({
    where: { token: dados.token, respondidoEm: null, expiraEm: { gt: new Date() } },
    data: {
      nota: dados.nota,
      problemaResolvido: dados.problemaResolvido,
      comentario: dados.comentario?.trim() || null,
      canal: dados.origem,
      respondidoEm: new Date(),
      respostaIp: dados.ip,
      respostaUserAgent: dados.userAgent,
    },
  })
  return resultado.count === 1
}

function mesmoIp(a?: string | null, b?: string | null) {
  return !!a && !!b && a !== 'unknown' && a === b
}

// Sinais simples de possivel fraude para o gestor - nao provam nada sozinhos
// (a equipe pode usar outra rede), so chamam atencao para conferir.
export async function auditarAvaliacao(chamadoId: string) {
  const av = await prisma.avaliacaoAtendimento.findUnique({
    where: { chamadoId },
    include: { chamado: { select: { dataFim: true } } },
  })
  if (!av) return null

  const ipDoTecnico = mesmoIp(av.respostaIp, av.ipFinalizacao) || mesmoIp(av.primeiroAcessoIp, av.ipFinalizacao)

  let avaliacoesMesmoIp = 0
  if (av.respostaIp && av.respostaIp !== 'unknown') {
    avaliacoesMesmoIp = await prisma.avaliacaoAtendimento.count({
      where: {
        respostaIp: av.respostaIp,
        respondidoEm: { gte: new Date(Date.now() - JANELA_MESMO_IP_DIAS * 24 * 60 * 60 * 1000) },
      },
    })
  }

  const minutosAposFinalizar =
    av.respondidoEm && av.chamado.dataFim
      ? Math.round((av.respondidoEm.getTime() - av.chamado.dataFim.getTime()) / 60000)
      : null

  const alertas: string[] = []
  if (ipDoTecnico) alertas.push('Avaliação feita do mesmo IP usado pelo técnico ao finalizar')
  if (avaliacoesMesmoIp > LIMITE_AVALIACOES_MESMO_IP) {
    alertas.push(`${avaliacoesMesmoIp} avaliações enviadas deste mesmo IP nos últimos ${JANELA_MESMO_IP_DIAS} dias`)
  }

  return {
    status: avaliacaoDisponivel(av),
    canal: av.canal,
    nota: av.nota,
    problemaResolvido: av.problemaResolvido,
    comentario: av.comentario,
    ipFinalizacao: av.ipFinalizacao,
    acessos: av.acessos,
    primeiroAcessoEm: av.primeiroAcessoEm,
    primeiroAcessoIp: av.primeiroAcessoIp,
    primeiroAcessoUserAgent: av.primeiroAcessoUserAgent,
    respondidoEm: av.respondidoEm,
    respostaIp: av.respostaIp,
    respostaUserAgent: av.respostaUserAgent,
    ipIgualAoDoTecnico: ipDoTecnico,
    avaliacoesMesmoIp,
    minutosAposFinalizar,
    alertas,
  }
}
