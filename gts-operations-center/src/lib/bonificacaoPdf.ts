import type { ConteudoRelatorio, SecaoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { numeroOS } from '@/lib/ordemServico'
import { ROTULO_EVENTO, VALORES_CENTAVOS, type StatusDevolucao, type TipoEvento } from '@/lib/bonificacaoRegras'

// Comprovante da bonificacao por desempenho: mostra COMO o valor a receber de cada equipe foi calculado
// (resumo por tipo de lancamento, O.S. por O.S., conferencia das devolucoes e avaliacoes em analise).
// Funcao pura: o desenho em A4 e' o mesmo renderizarPdf dos demais relatorios (logo GTSNET + simbolo Orbia).

type Data = string | Date

export interface EquipeParaPdf {
  equipe: string
  tecnicos: string[]
  posicao: number
  creditos: number
  debitos: number
  saldo: number
  concluidos: number
  slaCumprido: number
  percentualSla: number | null
  mediaAvaliacao: number | null
  itens: {
    chamadoId: string; cliente: string; evento: TipoEvento; centavos: number; data: Data
    devolucao?: StatusDevolucao; conferidoPor?: string | null; conferidoEm?: Data | null; conferidoMotivo?: string | null
  }[]
  pendencias: { chamadoId: string; cliente: string; centavosSeAprovada: number }[]
  fechamento: { saldo: number; aprovadoPor: string; aprovadoEm: Data; mudouDepois: boolean } | null
}

const dd = (n: number) => String(n).padStart(2, '0')
const data = (v: Data) => { const d = new Date(v); return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}` }
const dataHora = (v: Data) => { const d = new Date(v); return `${data(d)} ${dd(d.getHours())}:${dd(d.getMinutes())}` }
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
const sinal = (c: number) => (c > 0 ? `+${brl(c)}` : brl(c))
const NAO = '—'

/** O fim do periodo vem "exclusivo" (meia-noite do dia seguinte): mostra o ultimo dia incluido. */
export function rotuloPeriodo(inicio: Data, fim: Data): string {
  const ultimo = new Date(new Date(fim).getTime() - 60_000)
  const a = data(inicio), b = data(ultimo)
  return a === b ? a : `${a} a ${b}`
}

const SITUACAO_DEVOLUCAO: Record<StatusDevolucao, string> = { PENDENTE: 'Ainda não conferida', CONFIRMADA: 'Aprovada', RECUSADA: 'Reprovada (sem crédito)' }

function secoesDaEquipe(e: EquipeParaPdf, periodo: string, titulo: (t: string) => string, varias: boolean): SecaoRelatorio[] {
  const nome = varias ? `${e.equipe} · ` : ''
  const secoes: SecaoRelatorio[] = []

  const fc = e.fechamento
  const situacao = fc
    ? `Fechamento aprovado por ${fc.aprovadoPor} em ${dataHora(fc.aprovadoEm)}, no valor de ${brl(fc.saldo)}${fc.mudouDepois ? `. Atenção: depois da aprovação o cálculo atual mudou para ${brl(e.saldo)}` : ''}`
    : 'Valores calculados até agora; o fechamento ainda não foi aprovado pelo administrador'
  secoes.push({
    titulo: titulo(`${nome}Resumo do período`),
    pares: [
      ['Equipe', e.equipe],
      ['Técnicos', e.tecnicos.length ? e.tecnicos.join(', ') : NAO],
      ['Período', periodo],
      ['Posição no ranking', `${e.posicao}º`],
      ['O.S. concluídas', String(e.concluidos)],
      ['SLA cumprido', e.concluidos > 0 ? `${e.slaCumprido} de ${e.concluidos}${e.percentualSla != null ? ` (${e.percentualSla.toLocaleString('pt-BR')}%)` : ''}` : NAO],
      ['Média das avaliações aprovadas', e.mediaAvaliacao != null ? e.mediaAvaliacao.toLocaleString('pt-BR') : NAO],
      ['Créditos', brl(e.creditos)],
      ['Débitos', brl(e.debitos)],
      ['VALOR A RECEBER', brl(e.saldo)],
      ['Situação', situacao],
    ],
  })

  // Resumo por tipo de lancamento: quantidade x valor = total (permite conferir a conta de cabeca).
  const porEvento = new Map<TipoEvento, { qtd: number; total: number }>()
  for (const it of e.itens) {
    const g = porEvento.get(it.evento) ?? { qtd: 0, total: 0 }
    g.qtd++; g.total += it.centavos
    porEvento.set(it.evento, g)
  }
  if (porEvento.size > 0) {
    secoes.push({
      titulo: titulo(`${nome}Como o valor foi calculado`),
      tabela: {
        colunas: ['Lançamento', 'Qtde.', 'Valor unitário', 'Total'],
        linhas: [
          ...Array.from(porEvento.entries()).map(([ev, g]) => [ROTULO_EVENTO[ev], String(g.qtd), sinal(VALORES_CENTAVOS[ev]), sinal(g.total)]),
          ['VALOR A RECEBER', '', '', brl(e.saldo)],
        ],
      },
    })
  }

  secoes.push({
    titulo: titulo(`${nome}Lançamentos, O.S. por O.S.`),
    ...(e.itens.length === 0
      ? { paragrafos: ['Nenhum lançamento no período.'] }
      : {
          tabela: {
            colunas: ['Data', 'O.S.', 'Cliente', 'Lançamento', 'Valor'],
            linhas: [...e.itens]
              .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
              .map(it => [dataHora(it.data), numeroOS(it.chamadoId), it.cliente, ROTULO_EVENTO[it.evento], sinal(it.centavos)]),
          },
        }),
  })

  const retiradas = e.itens.filter(it => it.devolucao)
  if (retiradas.length > 0) {
    secoes.push({
      titulo: titulo(`${nome}Conferência da devolução do equipamento (retiradas)`),
      tabela: {
        colunas: ['O.S.', 'Cliente', 'Situação', 'Conferido por', 'Em', 'Observação'],
        linhas: retiradas.map(it => [
          numeroOS(it.chamadoId), it.cliente, SITUACAO_DEVOLUCAO[it.devolucao!],
          it.conferidoPor || NAO, it.conferidoEm ? dataHora(it.conferidoEm) : NAO, it.conferidoMotivo || NAO,
        ]),
      },
    })
  }

  if (e.pendencias.length > 0) {
    secoes.push({
      titulo: titulo(`${nome}Avaliações em análise (não incluídas no valor)`),
      paragrafos: ['Estas avaliações ainda não foram aprovadas pelo administrador e por isso não entram no valor a receber. Se aprovadas, o valor muda conforme abaixo.'],
      tabela: {
        colunas: ['O.S.', 'Cliente', 'Se aprovada'],
        linhas: e.pendencias.map(p => [numeroOS(p.chamadoId), p.cliente, p.centavosSeAprovada === 0 ? 'neutra (R$ 0,00)' : sinal(p.centavosSeAprovada)]),
      },
    })
  }
  return secoes
}

export function montarConteudoBonificacao(
  p: { periodo: { inicio: Data; fim: Data }; equipes: EquipeParaPdf[] },
  emitidoPor: string,
  emitidoEm = new Date(),
): ConteudoRelatorio {
  const periodo = rotuloPeriodo(p.periodo.inicio, p.periodo.fim)
  const varias = p.equipes.length > 1
  let k = 0
  const titulo = (t: string) => `${++k}. ${t}`
  const secoes: SecaoRelatorio[] = []

  if (varias) {
    secoes.push({
      titulo: titulo('Resumo geral das equipes'),
      tabela: {
        colunas: ['Pos.', 'Equipe', 'Concluídas', 'Créditos', 'Débitos', 'A receber', 'Fechamento'],
        linhas: [
          ...p.equipes.map(e => [`${e.posicao}º`, e.equipe, String(e.concluidos), brl(e.creditos), brl(e.debitos), brl(e.saldo), e.fechamento ? `Aprovado em ${data(e.fechamento.aprovadoEm)}` : 'Aguardando aprovação']),
          ['', 'TOTAL', String(p.equipes.reduce((s, e) => s + e.concluidos, 0)), brl(p.equipes.reduce((s, e) => s + e.creditos, 0)), brl(p.equipes.reduce((s, e) => s + e.debitos, 0)), brl(p.equipes.reduce((s, e) => s + e.saldo, 0)), ''],
        ],
      },
    })
  }
  for (const e of p.equipes) secoes.push(...secoesDaEquipe(e, periodo, titulo, varias))

  secoes.push({
    titulo: titulo('Valores aplicados'),
    paragrafos: ['Valores de cada lançamento na data da emissão deste comprovante. Avaliação 3 é neutra; rota e negociação de cancelamento não são calculadas pelo sistema; O.S. encerrada pela gestão não gera crédito.'],
    tabela: {
      colunas: ['Lançamento', 'Valor'],
      linhas: (Object.keys(VALORES_CENTAVOS) as TipoEvento[]).map(ev => [ROTULO_EVENTO[ev], sinal(VALORES_CENTAVOS[ev])]),
    },
  })

  secoes.push({
    titulo: titulo('Emissão'),
    pares: [['Emitido por', emitidoPor], ['Emitido em', dataHora(emitidoEm)]],
  })

  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)
  const quem = varias ? 'todas-as-equipes' : slug(p.equipes[0]?.equipe ?? 'equipe')
  return {
    titulo: 'Comprovante de Bonificação por Desempenho',
    subtitulo: `GTSNET Provedor de Internet · ${varias ? 'Todas as equipes' : p.equipes[0]?.equipe ?? ''} · ${periodo}`,
    secoes,
    nomeArquivo: `bonificacao-${quem || 'equipe'}-${emitidoEm.getFullYear()}-${dd(emitidoEm.getMonth() + 1)}-${dd(emitidoEm.getDate())}.pdf`,
    rodape: `GTSNET · Comprovante de bonificação · Período ${periodo} · Emitido em ${dataHora(emitidoEm)}`,
    logoOrbia: true,
  }
}
