// Gestao de Desempenho: pontuacao opcional (0 a 100) e comparativo entre periodos. Puro e testado.
// A pontuacao NAO e calculada enquanto o gestor nao configurar os pesos e aprovar os criterios.

import type { Valor } from './indicadores'
import type { ResultadoMeta } from './metas'

export interface ConfigPontuacao {
  ativa: boolean
  aprovadaPor: string | null
  aprovadaEm: string | null
  /** indicador -> peso (>= 0). So indicadores com peso > 0 entram. */
  pesos: Record<string, number>
}

export const PONTUACAO_PADRAO: ConfigPontuacao = { ativa: false, aprovadaPor: null, aprovadaEm: null, pesos: {} }

export type MotivoSemPontuacao = 'INATIVA' | 'SEM_APROVACAO' | 'SEM_PESOS' | 'SEM_DADOS'

export interface ResultadoPontuacao {
  pontuacao: number | null
  motivo: MotivoSemPontuacao | null
  detalhes: { indicador: string; peso: number; nota: number }[]
}

/** Nota por indicador = cumprimento da meta limitado a 0-100; media ponderada so entre os indicadores com meta e dado. */
export function calcularPontuacao(resultados: Record<string, ResultadoMeta>, cfg: ConfigPontuacao): ResultadoPontuacao {
  const vazio = (motivo: MotivoSemPontuacao): ResultadoPontuacao => ({ pontuacao: null, motivo, detalhes: [] })
  if (!cfg.ativa) return vazio('INATIVA')
  if (!cfg.aprovadaPor) return vazio('SEM_APROVACAO')
  const comPeso = Object.entries(cfg.pesos).filter(([, p]) => p > 0)
  if (comPeso.length === 0) return vazio('SEM_PESOS')

  const detalhes: ResultadoPontuacao['detalhes'] = []
  for (const [indicador, peso] of comPeso) {
    const r = resultados[indicador]
    if (!r || r.semaforo === 'CINZA' || r.cumprimentoPct === null) continue
    detalhes.push({ indicador, peso, nota: Math.min(100, Math.max(0, r.cumprimentoPct)) })
  }
  const pesoTotal = detalhes.reduce((s, d) => s + d.peso, 0)
  if (pesoTotal === 0) return vazio('SEM_DADOS')
  const pontuacao = Math.round((detalhes.reduce((s, d) => s + d.nota * d.peso, 0) / pesoTotal) * 10) / 10
  return { pontuacao, motivo: null, detalhes }
}

export type Tendencia = 'MELHOROU' | 'PIOROU' | 'IGUAL'

export interface Comparativo {
  atual: number | null
  anterior: number | null
  /** Diferenca absoluta (atual - anterior). */
  variacao: number | null
  /** Variacao percentual sobre o anterior; null quando o anterior e 0 ou ausente. */
  variacaoPct: number | null
  tendencia: Tendencia | null
}

/** Compara dois valores do mesmo indicador. "Melhorou" respeita o sentido (menos tempo/pendencia = melhor). */
export function compararValores(atual: Valor | undefined, anterior: Valor | undefined, sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR'): Comparativo {
  const a = atual && atual.disponivel ? atual.valor : null
  const b = anterior && anterior.disponivel ? anterior.valor : null
  if (a === null || b === null) return { atual: a, anterior: b, variacao: null, variacaoPct: null, tendencia: null }
  const variacao = Math.round((a - b) * 100) / 100
  const variacaoPct = b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10
  const tendencia: Tendencia = variacao === 0 ? 'IGUAL' : (variacao > 0) === (sentido === 'MAIOR_MELHOR') ? 'MELHOROU' : 'PIOROU'
  return { atual: a, anterior: b, variacao, variacaoPct, tendencia }
}
