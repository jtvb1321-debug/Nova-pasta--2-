import { z } from 'zod'
import { ErroFerramenta } from './tipos'

// Periodos aceitos pelas ferramentas (mesma convencao de dias do restante do sistema).
export const PERIODOS = ['hoje', 'semana', '7d', '30d', 'mes', 'mes_anterior', '90d'] as const
export type PeriodoIA = (typeof PERIODOS)[number]

const DATA = /^\d{4}-\d{2}-\d{2}$/
const DIA_MS = 86_400_000
export const MAX_DIAS_CONSULTA = 366

export const esquemaPeriodo = {
  periodo: z.enum(PERIODOS).optional().describe('Periodo pronto. Padrao: 30d.'),
  dataInicio: z.string().regex(DATA, 'Use AAAA-MM-DD').optional().describe('Inicio (AAAA-MM-DD). Use junto com dataFim.'),
  dataFim: z.string().regex(DATA, 'Use AAAA-MM-DD').optional().describe('Fim inclusive (AAAA-MM-DD).'),
}

export interface IntervaloIA {
  inicio: Date
  fim: Date // exclusivo
  dias: number
  rotulo: string
}

const diaLocal = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    throw new ErroFerramenta('INVALIDO', `Data inválida: ${iso}`)
  }
  return dt
}

const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

export function resolverIntervalo(p: { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string }, agora = new Date()): IntervaloIA {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const amanha = new Date(hoje.getTime() + DIA_MS)
  let inicio: Date
  let fim: Date
  let rotulo: string

  if (p.dataInicio || p.dataFim) {
    if (!p.dataInicio || !p.dataFim) throw new ErroFerramenta('INVALIDO', 'Informe dataInicio e dataFim juntas.')
    inicio = diaLocal(p.dataInicio)
    fim = new Date(diaLocal(p.dataFim).getTime() + DIA_MS)
    if (fim <= inicio) throw new ErroFerramenta('INVALIDO', 'A data final não pode ser anterior à inicial.')
    rotulo = `${fmt(inicio)} a ${fmt(new Date(fim.getTime() - DIA_MS))}`
  } else {
    switch (p.periodo ?? '30d') {
      case 'hoje': inicio = hoje; fim = amanha; rotulo = 'hoje'; break
      case 'semana': inicio = new Date(hoje.getTime() - ((hoje.getDay() + 6) % 7) * DIA_MS); fim = amanha; rotulo = 'esta semana'; break
      case '7d': inicio = new Date(hoje.getTime() - 6 * DIA_MS); fim = amanha; rotulo = 'últimos 7 dias'; break
      case 'mes': inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1); fim = amanha; rotulo = 'este mês'; break
      case 'mes_anterior':
        inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
        fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
        rotulo = 'mês anterior'
        break
      case '90d': inicio = new Date(hoje.getTime() - 89 * DIA_MS); fim = amanha; rotulo = 'últimos 90 dias'; break
      case '30d':
      default: inicio = new Date(hoje.getTime() - 29 * DIA_MS); fim = amanha; rotulo = 'últimos 30 dias'
    }
  }
  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS))
  if (dias > MAX_DIAS_CONSULTA) throw new ErroFerramenta('LIMITE', `O período máximo é de ${MAX_DIAS_CONSULTA} dias.`)
  return { inicio, fim, dias, rotulo }
}

// Paginacao padrao (limite pequeno por seguranca e para caber no contexto do modelo).
export const esquemaPaginacao = {
  limite: z.number().int().min(1).max(50).optional().describe('Registros por pagina (1-50). Padrao: 15.'),
  pagina: z.number().int().min(1).max(1000).optional().describe('Pagina (comeca em 1).'),
}
export const paginar = (p: { limite?: number; pagina?: number }) => {
  const limite = p.limite ?? 15
  const pagina = p.pagina ?? 1
  return { limite, pagina, skip: (pagina - 1) * limite }
}
