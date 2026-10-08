import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { temPermissao } from '@/lib/permissions'
import { auditarAvaliacao } from '@/lib/avaliacao'

const JANELA_MESMO_IP_DIAS = 30

// Detalhe completo de uma avaliacao para a sub-aba Avaliacoes (so ADMIN): a resposta do
// cliente, a auditoria (IPs e navegador), os dados do cliente e o que foi feito no atendimento.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'analisarAvaliacoes')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const chamadoId = request.nextUrl.searchParams.get('chamado') ?? ''
  if (!/^[a-z0-9]{10,40}$/i.test(chamadoId)) return NextResponse.json({ error: 'Chamado invalido' }, { status: 400 })

  try {
    const [chamado, analise, auditoria] = await Promise.all([
      prisma.chamado.findUnique({
        where: { id: chamadoId },
        select: {
          id: true, cliente: true, telefone: true, endereco: true, numero: true, complemento: true, bairro: true,
          condominio: true, bloco: true, apartamento: true, cidade: true, uf: true,
          tipo: true, status: true, eace: true, escolaResponsavel: true, escolaCodigoInep: true,
          observacao: true, relato: true, fotos: true,
          dataAbertura: true, dataInicio: true, dataFim: true,
          slaRespostaMinutos: true, slaResolucaoMinutos: true, dentroSlaResposta: true, dentroSlaResolucao: true,
          equipe: { select: { nome: true, funcionarios: { where: { ativo: true }, select: { nome: true } } } },
          clienteCadastro: { select: { codigoIxc: true } },
          materiaisUtilizados: { select: { quantidade: true, observacao: true, item: { select: { descricao: true, codigo: true } } } },
          unidadesEquipamento: { select: { macAddress: true, item: { select: { descricao: true } } } },
          diagnosticos: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              fase: true, problemaEncontrado: true, acaoRealizada: true,
              equipamentoSubstituido: true, equipamentoAntigoDesc: true, equipamentoNovoDesc: true,
            },
          },
        },
      }),
      prisma.avaliacaoAtendimento.findUnique({
        where: { chamadoId },
        select: { id: true, statusAnalise: true, analisadaPor: true, analisadaEm: true, motivoAnalise: true },
      }),
      auditarAvaliacao(chamadoId),
    ])
    if (!chamado || !analise || !auditoria) return NextResponse.json({ error: 'Avaliacao nao encontrada' }, { status: 404 })

    // Outras avaliacoes enviadas do mesmo IP nos ultimos 30 dias (IP repetido).
    const ipResposta = auditoria.respostaIp && auditoria.respostaIp !== 'unknown' ? auditoria.respostaIp : null
    const mesmoIp = ipResposta
      ? await prisma.avaliacaoAtendimento.findMany({
          where: {
            respostaIp: ipResposta,
            chamadoId: { not: chamadoId },
            respondidoEm: { gte: new Date(Date.now() - JANELA_MESMO_IP_DIAS * 24 * 60 * 60 * 1000) },
          },
          orderBy: { respondidoEm: 'desc' },
          take: 20,
          select: {
            chamadoId: true, nota: true, respondidoEm: true, statusAnalise: true,
            chamado: { select: { cliente: true, telefone: true, equipe: { select: { nome: true } } } },
          },
        })
      : []

    let fotos: string[] = []
    try { fotos = chamado.fotos ? JSON.parse(chamado.fotos) : [] } catch { fotos = [] }

    return NextResponse.json({
      avaliacao: { avaliacaoId: analise.id, ...analise, ...auditoria },
      outrasDoMesmoIp: mesmoIp.map(o => ({
        chamadoId: o.chamadoId,
        cliente: o.chamado.cliente,
        telefone: o.chamado.telefone,
        equipe: o.chamado.equipe?.nome ?? null,
        nota: o.nota,
        respondidoEm: o.respondidoEm,
        statusAnalise: o.statusAnalise,
      })),
      chamado: {
        ...chamado,
        fotos: Array.isArray(fotos) ? fotos.filter(f => typeof f === 'string') : [],
        tecnicos: chamado.equipe?.funcionarios.map(f => f.nome) ?? [],
        equipe: chamado.equipe?.nome ?? null,
        codigoIxc: chamado.clienteCadastro?.codigoIxc ?? null,
        clienteCadastro: undefined,
      },
    })
  } catch (error) {
    console.error('Erro ao carregar detalhe da avaliacao:', error)
    return NextResponse.json({ error: 'Erro ao carregar a avaliação' }, { status: 500 })
  }
}
