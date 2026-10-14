'use client'

import { formatarBytes } from '@/lib/diagnosticoConexao/formato'
import type { ConsumoDia } from '@/lib/diagnosticoConexao/tipos'

// Consumo por dia (volume em GB, NAO velocidade). Dias sem nenhuma sessao registrada ficam vazios:
// nao significa "zero de consumo", significa "nada registrado no IXC naquele dia".

function dias(inicio: string, fim: string): string[] {
  const out: string[] = []
  const [a, m, d] = inicio.split('-').map(Number)
  const [a2, m2, d2] = fim.split('-').map(Number)
  const fimData = new Date(a2, m2 - 1, d2)
  for (let x = new Date(a, m - 1, d); x <= fimData && out.length < 120; x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1)) {
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`)
  }
  return out
}

export function GraficoConsumo({ porDia, inicio, fim }: { porDia: ConsumoDia[]; inicio: string; fim: string }) {
  const lista = dias(inicio, fim)
  const mapa = new Map(porDia.map(x => [x.dia, x]))
  const maior = Math.max(1, ...porDia.map(x => Math.max(x.downloadBytes, x.uploadBytes)))
  const W = 760, H = 250, ml = 64, mr = 12, mt = 12, mb = 34
  const largura = W - ml - mr
  const altura = H - mt - mb
  const passo = largura / lista.length
  const barra = Math.max(2, Math.min(14, passo / 2 - 1))
  const y = (v: number) => mt + altura - (v / maior) * altura
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => maior * f)
  const cada = Math.ceil(lista.length / 10)
  const total = porDia.reduce((s, x) => s + x.downloadBytes + x.uploadBytes, 0)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-tema-suave">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" aria-hidden /> Download</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-500" aria-hidden /> Upload</span>
        <span>Volume por dia de início da sessão</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label={`Consumo por dia de ${inicio} a ${fim}. Total registrado: ${formatarBytes(total)}.`}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} className="stroke-tema-linha" strokeWidth={0.7} />
              <text x={ml - 6} y={y(t) + 3.5} textAnchor="end" className="fill-tema-suave" fontSize={10}>{formatarBytes(t)}</text>
            </g>
          ))}
          {lista.map((dia, i) => {
            const x0 = ml + i * passo + passo / 2
            const reg = mapa.get(dia)
            return (
              <g key={dia}>
                {reg && (
                  <>
                    <rect x={x0 - barra - 0.5} y={y(reg.downloadBytes)} width={barra} height={Math.max(1, mt + altura - y(reg.downloadBytes))} className="fill-orange-500" rx={1}>
                      <title>{`${dia.split('-').reverse().join('/')}: download ${formatarBytes(reg.downloadBytes)} · upload ${formatarBytes(reg.uploadBytes)} · ${reg.sessoes} sessão(ões)`}</title>
                    </rect>
                    <rect x={x0 + 0.5} y={y(reg.uploadBytes)} width={barra} height={Math.max(1, mt + altura - y(reg.uploadBytes))} className="fill-slate-500" rx={1}>
                      <title>{`${dia.split('-').reverse().join('/')}: upload ${formatarBytes(reg.uploadBytes)}`}</title>
                    </rect>
                  </>
                )}
                {i % cada === 0 && (
                  <text x={x0} y={H - 14} textAnchor="middle" className="fill-tema-suave" fontSize={10}>{dia.slice(8, 10)}/{dia.slice(5, 7)}</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-tema-apagado">Dias sem barra: nenhuma sessão registrada no IXC naquele dia (não é o mesmo que consumo zero).</p>
    </div>
  )
}
