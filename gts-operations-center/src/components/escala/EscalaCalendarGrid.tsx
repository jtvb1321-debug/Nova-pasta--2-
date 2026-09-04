'use client'

import { cn } from '@/lib/utils'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TIPO_CFG: Record<string, { label: string; cor: string; bg: string; dot: string }> = {
  TRABALHO:       { label: 'Trabalho',       cor: 'text-gray-300',   bg: 'bg-white/5',            dot: 'bg-gray-400' },
  FOLGA:          { label: 'Folga',          cor: 'text-blue-400',   bg: 'bg-blue-500/10',         dot: 'bg-blue-400' },
  PLANTAO_SABADO: { label: 'Plantao Sabado', cor: 'text-orange-400', bg: 'bg-orange-500/10',       dot: 'bg-orange-400' },
}

export { MESES, TIPO_CFG }

interface Props {
  mes: number
  ano: number
  escalas: any[]
  modoTodasEquipes?: boolean
  onDiaClick?: (data: Date) => void
}

export function EscalaCalendarGrid({ mes, ano, escalas, modoTodasEquipes, onDiaClick }: Props) {
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0)
  const diasNoMes = ultimoDia.getDate()
  const offsetInicial = primeiroDia.getDay()

  const escalasPorDia = new Map<string, any[]>()
  for (const e of escalas) {
    const d = new Date(e.data)
    const chave = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!escalasPorDia.has(chave)) escalasPorDia.set(chave, [])
    escalasPorDia.get(chave)!.push(e)
  }

  const celulas: (Date | null)[] = []
  for (let i = 0; i < offsetInicial; i++) celulas.push(null)
  for (let dia = 1; dia <= diasNoMes; dia++) celulas.push(new Date(ano, mes - 1, dia))

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((data, i) => {
          if (!data) return <div key={`vazio-${i}`} />
          const chave = `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`
          const eventosDoDia = escalasPorDia.get(chave) ?? []
          const ehSabado = data.getDay() === 6
          const ehHoje = data.toDateString() === new Date().toDateString()

          if (modoTodasEquipes) {
            return (
              <div
                key={chave}
                className={cn(
                  'min-h-[70px] rounded-lg p-1.5 border',
                  ehHoje ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/5 bg-white/[0.02]'
                )}
              >
                <p className={cn('text-xs font-medium mb-1', ehSabado ? 'text-orange-400' : 'text-gray-400')}>{data.getDate()}</p>
                <div className="space-y-0.5">
                  {eventosDoDia.slice(0, 3).map((e: any) => {
                    const cfg = TIPO_CFG[e.tipo] || TIPO_CFG.TRABALHO
                    return (
                      <div key={e.id} className={cn('text-[10px] px-1 py-0.5 rounded truncate', cfg.bg, cfg.cor)}>
                        {e.equipe?.nome}
                      </div>
                    )
                  })}
                  {eventosDoDia.length > 3 && (
                    <p className="text-[10px] text-gray-500">+{eventosDoDia.length - 3}</p>
                  )}
                </div>
              </div>
            )
          }

          const evento = eventosDoDia[0]
          const cfg = evento ? (TIPO_CFG[evento.tipo] || TIPO_CFG.TRABALHO) : null

          return (
            <button
              key={chave}
              onClick={() => onDiaClick?.(data)}
              disabled={!onDiaClick}
              className={cn(
                'min-h-[64px] rounded-lg p-1.5 border flex flex-col items-center justify-center gap-1 transition-colors',
                cfg ? cfg.bg : 'bg-white/[0.02]',
                ehHoje ? 'border-orange-500/40' : 'border-white/5',
                onDiaClick && 'hover:border-orange-500/30 cursor-pointer'
              )}
            >
              <p className={cn('text-xs font-medium', ehSabado ? 'text-orange-400' : 'text-gray-400')}>{data.getDate()}</p>
              {cfg && <span className={cn('text-[10px] font-medium', cfg.cor)}>{cfg.label}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}