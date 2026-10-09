import type { Indicador, Referencia, ResultadoFerramenta } from '../tipos'

// Utilitarios comuns dos servicos. Servicos NAO sabem de chat, de modelo nem de MCP.

export const r2 = (n: number) => Math.round(n * 100) / 100
export const pct = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null)
export const media = (v: number[]): number | null => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null)

/** Limite de seguranca de linhas lidas do banco por consulta agregada. */
export const LIMITE_LEITURA = 5000

export function montarResultado(p: {
  resumo: string
  dados: unknown
  indicadores?: Indicador[]
  referencias?: Referencia[]
  recomendacoes?: string[]
  avisos?: string[]
  tabelas: string[]
  truncado?: boolean
}): ResultadoFerramenta {
  return {
    resumo: p.resumo,
    dados: p.dados,
    indicadores: p.indicadores ?? [],
    referencias: (p.referencias ?? []).slice(0, 30),
    recomendacoes: p.recomendacoes ?? [],
    avisos: p.avisos ?? [],
    fonte: { consultadoEm: new Date().toISOString(), tabelas: p.tabelas },
    truncado: p.truncado,
  }
}

export interface Tendencia {
  direcao: 'subindo' | 'estavel' | 'caindo' | 'sem_dados'
  variacaoPercentual: number | null
  mediaPrimeiraMetade: number | null
  mediaSegundaMetade: number | null
  pontos: number
}

/**
 * Tendencia deterministica: compara a media da primeira e da segunda metade da serie.
 * Precisa de pelo menos 4 pontos; variacao relativa abaixo de 5% conta como estavel.
 */
export function calcularTendencia(serie: (number | null)[]): Tendencia {
  const v = serie.filter((x): x is number => x != null && Number.isFinite(x))
  if (v.length < 4) return { direcao: 'sem_dados', variacaoPercentual: null, mediaPrimeiraMetade: null, mediaSegundaMetade: null, pontos: v.length }
  const meio = Math.floor(v.length / 2)
  const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const a = m(v.slice(0, meio))
  const b = m(v.slice(v.length - meio))
  const variacao = a === 0 ? (b === 0 ? 0 : null) : ((b - a) / Math.abs(a)) * 100
  const direcao = variacao == null ? (b > a ? 'subindo' : 'estavel') : Math.abs(variacao) < 5 ? 'estavel' : variacao > 0 ? 'subindo' : 'caindo'
  return {
    direcao,
    variacaoPercentual: variacao == null ? null : Math.round(variacao * 10) / 10,
    mediaPrimeiraMetade: r2(a),
    mediaSegundaMetade: r2(b),
    pontos: v.length,
  }
}
