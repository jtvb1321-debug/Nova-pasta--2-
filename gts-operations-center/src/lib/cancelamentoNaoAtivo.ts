// Relatorio "Cancelamento de nao ativo": cliente cujo contrato JA ESTAVA suspenso ou bloqueado e, depois, foi cancelado.
// Funcoes puras (sem rede, sem banco), testadas. Os dados vem do contrato no IXC (cliente_contrato).
//
// O IXC nao guarda o "estado anterior" do contrato cancelado: o contrato cancelado termina como inativo/desativado,
// e a data de desativacao do acesso e' sempre a do proprio cancelamento. O que existe de confiavel sao as DATAS:
//   - ultimo bloqueio automatico e ultimo bloqueio manual;
//   - ultimos desbloqueios (automatico, manual e de confianca);
//   - inicio e fim de suspensao do contrato.
// A classificacao usa so essas datas, no nivel do dia, e exige uma antecedencia minima (padrao 2 dias) para nao contar
// o bloqueio que faz parte do proprio ato de cancelar.

export const MIN_DIAS_PADRAO = 2

export interface DatasContratoIxc {
  data_cancelamento?: string | null
  dt_ult_bloq_auto?: string | null
  dt_ult_bloq_manual?: string | null
  dt_ult_desbloq_auto?: string | null
  dt_ult_desbloq_manual?: string | null
  dt_ult_des_bloq_conf?: string | null
  data_inicial_suspensao?: string | null
  data_final_suspensao?: string | null
  data_negativacao?: string | null
}

export type SituacaoAnterior = 'Suspenso' | 'Bloqueado (automático)' | 'Bloqueado (manual)'

export interface EstadoAnterior {
  naoAtivo: boolean
  situacao: SituacaoAnterior | null
  /** Data (AAAA-MM-DD) em que o contrato entrou nessa situacao. */
  desde: string | null
  /** Dias entre essa data e o cancelamento. */
  diasAteCancelar: number | null
  /** Data em que o cliente foi negativado, se houve (informativo; nao entra no criterio). */
  negativadoEm: string | null
}

const DIA = 86_400_000
const valida = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  if (!s || s.startsWith('0000')) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
const diaMs = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d) }
export const diferencaDias = (de: string, ate: string) => Math.round((diaMs(ate) - diaMs(de)) / DIA)

export function classificarEstadoAnterior(c: DatasContratoIxc, minDias = MIN_DIAS_PADRAO): EstadoAnterior {
  const cancelamento = valida(c.data_cancelamento)
  const negativadoEm = valida(c.data_negativacao)
  const nenhum: EstadoAnterior = { naoAtivo: false, situacao: null, desde: null, diasAteCancelar: null, negativadoEm }
  if (!cancelamento) return nenhum
  const limite = (iso: string) => diferencaDias(iso, cancelamento) >= minDias

  // 1) Suspenso: a suspensao comecou com antecedencia e nao tinha terminado antes do cancelamento.
  const iniSusp = valida(c.data_inicial_suspensao)
  const fimSusp = valida(c.data_final_suspensao)
  if (iniSusp && limite(iniSusp) && (!fimSusp || fimSusp >= cancelamento)) {
    return { naoAtivo: true, situacao: 'Suspenso', desde: iniSusp, diasAteCancelar: diferencaDias(iniSusp, cancelamento), negativadoEm }
  }

  // 2) Bloqueado: o ULTIMO bloqueio e' anterior ao cancelamento (com antecedencia) e nao houve desbloqueio depois dele.
  const blocos = ([['Bloqueado (automático)', valida(c.dt_ult_bloq_auto)], ['Bloqueado (manual)', valida(c.dt_ult_bloq_manual)]] as [SituacaoAnterior, string | null][])
    .filter((x): x is [SituacaoAnterior, string] => !!x[1])
    .sort((a, b) => b[1].localeCompare(a[1]))
  if (blocos.length) {
    const [situacao, ultimo] = blocos[0]
    const desbloqueios = [c.dt_ult_desbloq_auto, c.dt_ult_desbloq_manual, c.dt_ult_des_bloq_conf].map(valida).filter((x): x is string => !!x)
    const voltou = desbloqueios.some(d => d >= ultimo && d <= cancelamento)
    if (limite(ultimo) && !voltou) {
      return { naoAtivo: true, situacao, desde: ultimo, diasAteCancelar: diferencaDias(ultimo, cancelamento), negativadoEm }
    }
  }
  return nenhum
}

// ------------------------------------------------------------------ agregados e conteudo do PDF
export interface LinhaNaoAtivo {
  contratoId: string
  clienteNome: string
  cidade: string | null
  telefone: string | null
  plano: string | null
  dataAtivacao: string | null
  dataCancelamento: string
  situacao: SituacaoAnterior
  desde: string
  diasAteCancelar: number
  negativadoEm: string | null
  motivoResumo: string | null
}

export interface ResumoNaoAtivo {
  totalCancelados: number
  totalNaoAtivos: number
  totalAtivos: number
  percentualNaoAtivos: number | null
  porSituacao: { situacao: string; quantidade: number }[]
  porMotivo: { motivo: string; quantidade: number }[]
  porCidade: { cidade: string; quantidade: number }[]
  mediaDiasAteCancelar: number | null
}

const contar = (valores: string[]) => [...valores.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].map(([k, quantidade]) => ({ k, quantidade })).sort((a, b) => b.quantidade - a.quantidade)

export function resumir(totalCancelados: number, linhas: LinhaNaoAtivo[]): ResumoNaoAtivo {
  const n = linhas.length
  return {
    totalCancelados, totalNaoAtivos: n, totalAtivos: totalCancelados - n,
    percentualNaoAtivos: totalCancelados > 0 ? Math.round((n / totalCancelados) * 1000) / 10 : null,
    porSituacao: contar(linhas.map(l => l.situacao)).map(x => ({ situacao: x.k, quantidade: x.quantidade })),
    porMotivo: contar(linhas.map(l => l.motivoResumo?.trim() || 'Não informado')).map(x => ({ motivo: x.k, quantidade: x.quantidade })),
    porCidade: contar(linhas.map(l => l.cidade || 'Não informado')).map(x => ({ cidade: x.k, quantidade: x.quantidade })),
    mediaDiasAteCancelar: n ? Math.round(linhas.reduce((s, l) => s + l.diasAteCancelar, 0) / n) : null,
  }
}

export const CRITERIO = (minDias: number) =>
  `Considera "não ativo" o contrato cancelado no mês que, pelas datas registradas no IXC, já estava SUSPENSO (suspensão iniciada pelo menos ${minDias} dia(s) antes do cancelamento e não encerrada) ` +
  `ou BLOQUEADO (último bloqueio automático ou manual pelo menos ${minDias} dia(s) antes do cancelamento, sem desbloqueio depois dele). ` +
  'O IXC não guarda o estado anterior do contrato cancelado; por isso a classificação usa essas datas. Bloqueio feito no próprio ato de cancelar não conta.'
