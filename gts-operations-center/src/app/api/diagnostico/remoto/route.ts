import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { classificar, type EntradaDiagnostico } from '@/lib/diagnosticoEngine'
import { buscarOnuParaDiagnostico } from '@/lib/diagnosticoOnu'

// Diagnostico remoto disparado pelo NOC/atendimento ANTES do despacho de
// equipe (fase REMOTO, distinta do par ANTES/DEPOIS do tecnico em campo -
// ver comentario no schema). Reaproveita o mesmo motor de classificacao e a
// mesma resolucao de ONU/sinal optico ja usados pelo fluxo do tecnico.

const bodySchema = z.object({
  chamadoId:    z.string().min(1),
  downloadMbps: z.number().nullable().optional(),
  uploadMbps:   z.number().nullable().optional(),
  latenciaMs:   z.number().nullable().optional(),
  jitterMs:     z.number().nullable().optional(),
  perdaPct:     z.number().nullable().optional(),
})

const ROLES_PERMITIDOS = ['ADMIN', 'GESTOR', 'OPERADOR']

function extrairMbpsDoPlano(plano: string | null | undefined): number | null {
  if (!plano) return null
  const match = plano.match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return null
  const n = parseFloat(match[1].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!ROLES_PERMITIDOS.includes(role)) {
    return NextResponse.json({ error: 'Apenas NOC/Operador podem executar diagnostico remoto' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { chamadoId, downloadMbps, uploadMbps, latenciaMs, jitterMs, perdaPct } = parsed.data

  const chamado = await prisma.chamado.findUnique({
    where: { id: chamadoId },
    include: { clienteCadastro: true },
  })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })

  // Consulta ONU/sinal optico no servidor (usa a API key do SmartOLT, que
  // nunca deve ir para o navegador). Reaproveita idOnuSmartOlt se ja
  // vinculado ao chamado; senao tenta achar por aproximacao do nome do
  // cliente e, se achar, grava de volta no chamado pra proxima vez.
  const infoOnu = await buscarOnuParaDiagnostico(chamado.idOnuSmartOlt, chamado.cliente)
  if (infoOnu.encontrada && infoOnu.idOnuSmartOlt && !chamado.idOnuSmartOlt) {
    await prisma.chamado.update({
      where: { id: chamadoId },
      data: { idOnuSmartOlt: infoOnu.idOnuSmartOlt },
    })
  }

  const planoMbps = extrairMbpsDoPlano(chamado.clienteCadastro?.plano)

  const entrada: EntradaDiagnostico = {
    planoMbps,
    downloadMbps: downloadMbps ?? null,
    uploadMbps: uploadMbps ?? null,
    latenciaGtsnetMs: latenciaMs ?? null,
    latenciaExternaMs: null,
    jitterMs: jitterMs ?? null,
    perdaPct: perdaPct ?? null,
    dnsOk: null,
    onuEncontrada: infoOnu.encontrada,
    onuStatus: infoOnu.status,
    sinalRxDbm: infoOnu.sinalRxDbm,
  }

  const resultado = classificar(entrada)

  const resumo = {
    downloadMbps: entrada.downloadMbps,
    uploadMbps: entrada.uploadMbps,
    latenciaMs: entrada.latenciaGtsnetMs,
    jitterMs: entrada.jitterMs,
    perdaPct: entrada.perdaPct,
    sinalRxDbm: entrada.sinalRxDbm,
    onuStatus: infoOnu.status,
    onuEncontrada: infoOnu.encontrada,
    planoMbps,
  }

  const testesServidor: { tipo: string; status: string; valor?: number | null; unidade?: string; detalhes?: any }[] = []
  if (downloadMbps != null) testesServidor.push({ tipo: 'VELOCIDADE', status: 'OK', valor: downloadMbps, unidade: 'Mbps', detalhes: { download: downloadMbps, upload: uploadMbps } })
  if (latenciaMs != null) testesServidor.push({ tipo: 'LATENCIA', status: 'OK', valor: latenciaMs, unidade: 'ms', detalhes: { gtsnetMs: latenciaMs } })
  if (jitterMs != null) testesServidor.push({ tipo: 'JITTER', status: 'OK', valor: jitterMs, unidade: 'ms' })
  if (perdaPct != null) testesServidor.push({ tipo: 'PERDA_PACOTES', status: 'OK', valor: perdaPct, unidade: '%' })
  testesServidor.push({
    tipo: 'ONU',
    status: infoOnu.encontrada ? (infoOnu.status && infoOnu.status !== 'Online' ? 'PROBLEMA' : 'OK') : 'INDISPONIVEL',
    detalhes: infoOnu,
  })
  testesServidor.push({
    tipo: 'SINAL_OPTICO',
    status: infoOnu.sinalRxDbm == null ? 'INDISPONIVEL'
      : infoOnu.sinalRxDbm <= -28 ? 'PROBLEMA'
      : infoOnu.sinalRxDbm <= -25 ? 'ATENCAO' : 'OK',
    valor: infoOnu.sinalRxDbm,
    unidade: 'dBm',
  })

  const diagnostico = await prisma.diagnostico.create({
    data: {
      chamadoId,
      fase: 'REMOTO',
      origem: 'NOC_REMOTO',
      status: 'CONCLUIDO',
      iniciadoPor: (session.user as any)?.name || (session.user as any)?.email,
      iniciadoPorUsuarioId: (session.user as any)?.id,
      classificacao: resultado.classificacao,
      origemProvavel: resultado.origemProvavel,
      confianca: resultado.confianca,
      evidencias: resultado.evidencias,
      hipotese: resultado.hipotese,
      recomendacoes: resultado.recomendacoes,
      resumo,
      finalizadoEm: new Date(),
      testes: { create: testesServidor },
    },
    include: { testes: true },
  })

  return NextResponse.json(diagnostico, { status: 201 })
}
