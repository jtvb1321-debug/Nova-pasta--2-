'use client'

import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'

interface SparklineProps {
  data: number[]
  color: string
}

export function Sparkline({ data, color }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className="h-10 flex items-center text-[10px] text-gray-500">Sem historico ainda</div>
  }

  const pontos = data.map((v, i) => ({ i, v }))

  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pontos} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={['auto', 'auto']} />
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${color.replace('#', '')})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
