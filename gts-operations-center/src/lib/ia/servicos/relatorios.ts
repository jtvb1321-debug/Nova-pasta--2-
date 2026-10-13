import { numeroOS } from '@/lib/ordemServico'
import { buscarContratosCanceladosPorMes } from '@/lib/ixcRelatorios'
import { exigirArea } from '../autorizacao'
import { neutralizarTexto } from '../seguranca'
import { ErroFerramenta, type ContextoIA } from '../tipos'
import { coletarVendas, mesDe } from './comercial'
import { coletarChamadosPorEquipe, coletarRechamadas, ROTULO_TIPO } from './gestao'

// Relatorios para baixar (CSV com ponto e virgula e BOM: abre direto no Excel em portugues).
// Somente leitura. Os mesmos dados das consultas do assistente, com o detalhe linha a linha.

export type TipoRelatorio = 'vendas' | 'chamados' | 'rechamadas' | 'cancelamentos'
export const TIPOS_RELATORIO: TipoRelatorio[] = ['vendas', 'chamados', 'rechamadas', 'cancelamentos']

type Celula = string | number | null | undefined

/** Protege contra "injecao de formula" no Excel e escapa separadores. */
export function celulaCsv(v: Celula): string {
  if (v == null) return ''
  let t = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  t = t.replace(/\r?\n/g, ' ')
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = `'${t}`
  return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

const linha = (cs: Celula[]) => cs.map(celulaCsv).join(';')
const dmy = (d: Date | null | undefined) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '')
const dmyhm = (d: Date | null | undefined) => (d ? `${dmy(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '')
const dinheiro = (n: number) => n.toFixed(2).replace('.', ',')

function cabecalho(titulo: string, periodo: string, ctx: ContextoIA) {
  return [linha([titulo]), linha(['Período', periodo]), linha(['Gerado em', dmyhm(new Date())]), linha(['Gerado por', ctx.nome ?? ctx.usuarioId]), '']
}

export interface RelatorioGerado { nomeArquivo: string; csv: string; periodo: string }

export async function gerarRelatorio(
  ctx: ContextoIA,
  tipo: TipoRelatorio,
  p: { dataInicio?: string; dataFim?: string; ano?: number; mes?: number },
): Promise<RelatorioGerado> {
  const periodoPronto = p.dataInicio && p.dataFim ? { dataInicio: p.dataInicio, dataFim: p.dataFim } : {}

  if (tipo === 'vendas') {
    const { iv, vendas, ranking } = await coletarVendas(ctx, periodoPronto)
    const csv = [
      ...cabecalho('Relatório de vendas', iv.rotulo, ctx),
      linha(['RANKING DE VENDEDORES (vendas aprovadas)']),
      linha(['#', 'Vendedor', 'Vendas aprovadas', 'Valor (R$)', 'Ticket médio (R$)', 'Instaladas', 'Comissão (R$)']),
      ...ranking.map((r, i) => linha([i + 1, r.vendedor, r.vendas, dinheiro(r.valor), dinheiro(r.ticketMedio), r.instaladas, dinheiro(r.comissao)])),
      '',
      linha(['VENDAS DO PERÍODO (todas as situações)']),
      linha(['Data', 'Vendedor', 'Cliente', 'Cidade', 'Plano', 'Valor (R$)', 'Situação', 'Instalação']),
      ...vendas.map(v => linha([dmy(v.data), v.vendedor?.nome, v.clienteNome, v.cidade, neutralizarTexto(v.planoVendido, 80), dinheiro(v.valor ?? 0), v.status, v.statusInstalacao])),
    ].join('\r\n')
    return { nomeArquivo: `vendas-${p.dataInicio ?? 'mes'}-a-${p.dataFim ?? 'hoje'}.csv`, csv, periodo: iv.rotulo }
  }

  if (tipo === 'chamados') {
    const { iv, linhas, chamados } = await coletarChamadosPorEquipe(ctx, periodoPronto)
    const nomeEquipe = new Map(linhas.map(l => [l.equipeId, l.equipe]))
    const retiradas = chamados.filter(c => c.tipo === 'RETIRADA')
    const csv = [
      ...cabecalho('Relatório de chamados por equipe', iv.rotulo, ctx),
      linha(['CHAMADOS POR EQUIPE (período = data de abertura)']),
      linha(['Equipe', 'Total', 'Concluídos', 'Cancelados', 'Pendentes', 'Índice de conclusão (%)', 'Recolhimentos', 'Recolhimentos concluídos']),
      ...linhas.map(l => linha([l.equipe, l.total, l.concluidos, l.cancelados, l.pendentes, l.taxaConclusao, l.retiradas, l.retiradasConcluidas])),
      '',
      linha(['RECOLHIMENTOS (chamados do tipo Retirada)']),
      linha(['O.S.', 'Aberto em', 'Equipe', 'Situação', 'Finalizado em']),
      ...retiradas.map(c => linha([numeroOS(c.id), dmyhm(c.dataAbertura), nomeEquipe.get(c.equipeId ?? '__sem__') ?? 'Sem equipe', c.status, dmyhm(c.dataFim)])),
    ].join('\r\n')
    return { nomeArquivo: `chamados-por-equipe-${p.dataInicio ?? 'mes'}-a-${p.dataFim ?? 'hoje'}.csv`, csv, periodo: iv.rotulo }
  }

  if (tipo === 'rechamadas') {
    const { iv, linhas, rechamados, nomes } = await coletarRechamadas(ctx, periodoPronto)
    const csv = [
      ...cabecalho('Relatório de rechamadas por cliente', iv.rotulo, ctx),
      linha(['CLIENTES COM RECHAMADA']),
      linha(['#', 'Cliente', 'Tipo', 'Rechamadas', 'Confirmadas', 'A validar', 'Chamados no período', 'Índice (%)', 'Equipes', 'Última abertura']),
      ...linhas.map((l, i) => linha([i + 1, l.cliente, l.eace ? 'EACE (escola)' : 'Convencional', l.rechamadas, l.confirmadas, l.possiveis, l.chamadosNoPeriodo, l.indice, l.equipes.join(', '), dmy(l.ultima)])),
      '',
      linha(['CHAMADOS COM RECHAMADA']),
      linha(['O.S.', 'Cliente', 'Tipo do chamado', 'Aberto em', 'Equipe', 'Situação da rechamada']),
      ...rechamados.map(c => linha([numeroOS(c.id), c.cliente, ROTULO_TIPO[c.tipo] ?? c.tipo, dmyhm(c.dataAbertura), c.equipeId ? nomes.get(c.equipeId) ?? 'Equipe removida' : 'Sem equipe', c.statusRechamada === 'CONFIRMADA' ? 'Confirmada' : 'A validar'])),
    ].join('\r\n')
    return { nomeArquivo: `rechamadas-${p.dataInicio ?? 'periodo'}-a-${p.dataFim ?? 'hoje'}.csv`, csv, periodo: iv.rotulo }
  }

  // cancelamentos (IXC ao vivo)
  exigirArea(ctx, 'comercial')
  if (!ctx.permissoes.verClientes) throw new ErroFerramenta('NEGADO', 'Seu perfil não tem permissão para consultar clientes e cancelamentos.')
  const { ano, mes } = mesDe(p)
  if (mes < 1 || mes > 12 || ano < 2015 || ano > 2100) throw new ErroFerramenta('INVALIDO', 'Mês ou ano inválido.')
  let lista
  try { lista = await buscarContratosCanceladosPorMes(ano, mes) } catch { throw new ErroFerramenta('ERRO', 'Não consegui consultar o IXC agora. Tente de novo em instantes.') }
  const periodo = `${String(mes).padStart(2, '0')}/${ano}`
  const csv = [
    ...cabecalho('Relatório de cancelamentos (IXC)', periodo, ctx),
    linha(['CONTRATOS CANCELADOS NO MÊS (consulta direta ao IXC)']),
    linha(['Contrato', 'Cliente', 'Cidade', 'Plano', 'Ativação', 'Cancelamento', 'Motivo']),
    ...lista.map(c => linha([c.contratoId, c.clienteNome, c.cidade, c.plano, c.dataAtivacao, c.dataCancelamento, neutralizarTexto(c.motivoResumo, 120)])),
  ].join('\r\n')
  return { nomeArquivo: `cancelamentos-ixc-${ano}-${String(mes).padStart(2, '0')}.csv`, csv, periodo }
}
