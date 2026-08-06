'use client'

interface RadialGaugeProps {
  valor: number | null
  cor: string
  label: string
  sufixo?: string
  tamanho?: number
}

// Gauge circular em SVG puro (sem lib de grafico) - leve o suficiente para
// rodar o dia inteiro numa TV sem consumir CPU/GPU desnecessariamente.
export function RadialGauge({ valor, cor, label, sufixo = '%', tamanho = 140 }: RadialGaugeProps) {
  const v = Math.max(0, Math.min(100, valor ?? 0))
  const raio = tamanho / 2 - 10
  const centro = tamanho / 2
  const circunferencia = 2 * Math.PI * raio
  const offset = circunferencia * (1 - v / 100)
  const gaugeId = `gauge-${label.replace(/\s/g, '')}`

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: tamanho, height: tamanho }}>
        <svg width={tamanho} height={tamanho} className="-rotate-90">
          <defs>
            <filter id={`${gaugeId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={centro} cy={centro} r={raio} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
          {valor != null && (
            <circle
              cx={centro}
              cy={centro}
              r={raio}
              fill="none"
              stroke={cor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={circunferencia}
              strokeDashoffset={offset}
              filter={`url(#${gaugeId}-glow)`}
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-black text-white tabular-nums">
            {valor != null ? `${Math.round(valor)}` : '—'}
            {valor != null && <span className="text-lg text-gray-400">{sufixo}</span>}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-400 font-medium">{label}</p>
    </div>
  )
}
