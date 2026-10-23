'use client'

import type { LeituraOptica } from '@/lib/diagnosticoConexao/tipos'

// Tendencia do sinal optico (dBm) com as leituras que o IXC guarda. Cada ponto e' uma leitura real; nao ha interpolacao nem valor
// simulado. A faixa sombreada e' o limite de REFERENCIA de recepcao (RX) - pode nao ser o limite correto do modelo.

const ms = (s: string) => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : 0 }
const rotuloData = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`

export function GraficoOptico({ leituras, limiteMin, limiteMax }: { leituras: LeituraOptica[]; limiteMin: number; limiteMax: number }) {
  const pts = leituras.filter(l => l.rxDbm != null || l.txDbm != null)
  if (pts.length < 2) return <p className="text-sm text-tema-suave">Poucas leituras válidas para traçar a tendência ({pts.length}).</p>
  const valores = pts.flatMap(l => [l.rxDbm, l.txDbm]).filter((v): v is number => v != null)
  let min = Math.floor(Math.min(...valores, limiteMin) - 1), max = Math.ceil(Math.max(...valores, limiteMax <= -5 ? limiteMax : -5) + 1)
  if (max - min < 6) { max += 3; min -= 3 }
  const W = 760, H = 260, ml = 52, mr = 14, mt = 14, mb = 36
  const t0 = ms(pts[0].em), t1 = ms(pts[pts.length - 1].em), dt = Math.max(1, t1 - t0)
  const x = (s: string) => ml + ((ms(s) - t0) / dt) * (W - ml - mr)
  const y = (v: number) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb)
  const linha = (campo: 'rxDbm' | 'txDbm') => pts.filter(l => l[campo] != null).map(l => `${x(l.em).toFixed(1)},${y(l[campo] as number).toFixed(1)}`).join(' ')
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(min + ((max - min) * i) / 4))
  const rotulos = [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts[pts.length - 1]]
  const yMax = y(Math.min(limiteMax, max)), yMin = y(Math.max(limiteMin, min))

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-tema-suave">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-orange-500" aria-hidden /> RX (recepção da ONU)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-slate-500" aria-hidden /> TX</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-emerald-500/20" aria-hidden /> Faixa de referência do RX ({limiteMin} a {limiteMax} dBm)</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label={`Sinal óptico de ${rotuloData(pts[0].em)} a ${rotuloData(pts[pts.length - 1].em)}: ${pts.length} leituras.`}>
          <rect x={ml} y={yMax} width={W - ml - mr} height={Math.max(0, yMin - yMax)} className="fill-emerald-500/10" />
          {ticks.map(t => (
            <g key={t}><line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className="stroke-tema-linha" strokeWidth={0.7} /><text x={ml - 6} y={y(t) + 3.5} textAnchor="end" className="fill-tema-suave" fontSize={10}>{t}</text></g>
          ))}
          <polyline points={linha('txDbm')} fill="none" className="stroke-slate-500" strokeWidth={1.5} />
          <polyline points={linha('rxDbm')} fill="none" className="stroke-orange-500" strokeWidth={2} />
          {pts.filter(l => l.rxDbm != null).map(l => <circle key={l.em} cx={x(l.em)} cy={y(l.rxDbm as number)} r={2.6} className="fill-orange-500"><title>{`${rotuloData(l.em)}: RX ${l.rxDbm} dBm${l.txDbm != null ? ` · TX ${l.txDbm} dBm` : ''}${l.temperaturaC != null ? ` · ${l.temperaturaC} °C` : ''}`}</title></circle>)}
          {rotulos.map((l, i) => <text key={i} x={x(l.em)} y={H - 12} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="fill-tema-suave" fontSize={10}>{rotuloData(l.em)}</text>)}
          <text x={4} y={12} className="fill-tema-suave" fontSize={10}>dBm</text>
        </svg>
      </div>
    </div>
  )
}
