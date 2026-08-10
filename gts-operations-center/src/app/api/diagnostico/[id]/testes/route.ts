import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { classificar, type EntradaDiagnostico } from '@/lib/diagnosticoEngine'
import { buscarOnuParaDiagnostico } from '@/lib/diagnosticoOnu'

const testeSchema = z.object({
  tipo:      z.string().min(1),
  status:    z.enum(['OK', 'ATENCAO', 'PROBLEMA', 'INDISPONIVEL', 'ERRO']),
  valor:     z.number().nullable().optional(),
  unidade:   z.string().nullable().optional(),
  duracaoMs: z.number().nullable().optional(),
  detalhes:  z.any().optional(),
  erro:      z.string().nullable().optional(),
})

const bodySchema = z.object({
  testes:    z.array(testeSchema).min(1),
  planoMbps: z.number().nullable().optional(),
})

function numeroDeTeste(testes: z.infer<typeof testeSchema>[], tipo: string, campo?: string): number | null {
  const t = testes.find(x => x.tipo === tipo)
  if (!t) return null
  if (campo) {
    const v = t.detalhes?.[campo]
    return typeof v === 'number' ? v : null
  }
  return typeof t.valor === 'number' ? t.valor : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const diagnostico = await prisma.diagnostico.findUnique({
    where: { id },
    include: { chamado: { select: { cliente: true, telefone: true, idOnuSmartOlt: true } } },
  })
  if (!diagnostico) return NextResponse.json({ error: 'Diagnostico nao encontrado' }, { status: 404 })

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { testes, planoMbps } = parsed.data

  // Consulta ONU/sinal optico no servidor (usa a API key do SmartOLT, que
  // nunca deve ir para o navegador). Reaproveita idOnuSmartOlt se ja
  // vinculado ao chamado; senao tenta achar por aproximacao do nome do
  // cliente e, se achar, grava de volta no chamado pra proxima vez.
  const infoOnu = await buscarOnuParaDiagnostico(diagnostico.chamado.idOnuSmartOlt, diagnostico.chamado.cliente)
  if (infoOnu.encontrada && infoOnu.idOnuSmartOlt && !diagnostico.chamado.idOnuSmartOlt) {
    await prisma.chamado.update({
      where: { id: diagnostico.chamadoId },
      data: { idOnuSmartOlt: infoOnu.idOnuSmartOlt },
    })
  }

  const entrada: EntradaDiagnostico = {
    planoMbps,
    downloadMbps: numeroDeTeste(testes, 'VELOCIDADE', 'download') ?? numeroDeTeste(testes, 'VELOCIDADE'),
    uploadMbps: numeroDeTeste(testes, 'VELOCIDADE', 'upload'),
    latenciaGtsnetMs: numeroDeTeste(testes, 'LATENCIA', 'gtsnetMs'),
    latenciaExternaMs: numeroDeTeste(testes, 'LATENCIA', 'externaMs'),
    jitterMs: numeroDeTeste(testes, 'JITTER'),
    perdaPct: numeroDeTeste(testes, 'PERDA_PACOTES'),
    dnsOk: testes.find(t => t.tipo === 'DNS')?.status === 'OK' ? true
         : testes.find(t => t.tipo === 'DNS')?.status === 'PROBLEMA' ? false
         : null,
    onuEncontrada: infoOnu.encontrada,
    onuStatus: infoOnu.status,
    sinalRxDbm: infoOnu.sinalRxDbm,
  }

  const resultado = classificar(entrada)

  const resumo = {
    downloadMbps: entrada.downloadMbps,
    uploadMbps: entrada.uploadMbps,
    latenciaGtsnetMs: entrada.latenciaGtsnetMs,
    latenciaExternaMs: entrada.latenciaExternaMs,
    jitterMs: entrada.jitterMs,
    perdaPct: entrada.perdaPct,
    sinalRxDbm: entrada.sinalRxDbm,
    onuStatus: infoOnu.status,
  }

  const testesServidor = [
    {
      tipo: 'ONU',
      status: infoOnu.encontrada ? (infoOnu.status && infoOnu.status !== 'Online' ? 'PROBLEMA' : 'OK') : 'INDISPONIVEL',
      detalhes: infoOnu,
    },
    {
      tipo: 'SINAL_OPTICO',
      status: infoOnu.sinalRxDbm == null ? 'INDISPONIVEL'
        : infoOnu.sinalRxDbm <= -28 ? 'PROBLEMA'
        : infoOnu.sinalRxDbm <= -25 ? 'ATENCAO' : 'OK',
      valor: infoOnu.sinalRxDbm,
      unidade: 'dBm',
    },
  ]

  const [, , diagnosticoAtualizado] = await prisma.$transaction([
    prisma.diagnosticoTeste.createMany({
      data: testes.map(t => ({
        diagnosticoId: id,
        tipo: t.tipo,
        status: t.status,
        valor: t.valor ?? null,
        unidade: t.unidade ?? null,
        duracaoMs: t.duracaoMs ?? null,
        detalhes: t.detalhes ?? undefined,
        erro: t.erro ?? null,
      })),
    }),
    prisma.diagnosticoTeste.createMany({
      data: testesServidor.map(t => ({
        diagnosticoId: id,
        tipo: t.tipo,
        status: t.status,
        valor: (t as any).valor ?? null,
        unidade: (t as any).unidade ?? null,
        detalhes: (t as any).detalhes ?? undefined,
      })),
    }),
    prisma.diagnostico.update({
      where: { id },
      data: {
        classificacao: resultado.classificacao,
        origemProvavel: resultado.origemProvavel,
        recomendacoes: resultado.recomendacoes,
        resumo,
      },
      include: { testes: true },
    }),
  ])

  return NextResponse.json(diagnosticoAtualizado)
}
