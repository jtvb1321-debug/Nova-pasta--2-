'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  avaliacoes: {
    respondidas: number
    pendentesAnalise?: number
    finalizados: number
    participacao: number | null
    media: number | null
    distribuicao: Record<string, number>
    resolucao: Record<string, number>
    porCanal: Record<string, number>
    porEquipe: { equipe: string; quantidade: number; media: number }[]
  }
  rechamadas?: { possiveis: number; confirmadas: number; descartadas: number; percentualConfirmadas: number }
}

function pct(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

// Indice de avaliacao do mes (respostas do QR code e do WhatsApp) - so
// leitura, calculado em /api/reports/mensal-qualidade.
export function IndiceAvaliacao({ avaliacoes, rechamadas }: Props) {
  const total = avaliacoes.respondidas
  return (
    <div className="bg-tema-contraste/[0.02] border border-tema-linha rounded-lg p-3 mb-4 space-y-3">
      <p className="text-[11px] font-semibold text-tema-suave">Índice de avaliação do mês</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-tema-apagado">Nota média</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-tema-tinta">
              {avaliacoes.media != null ? avaliacoes.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—'}
            </span>
            <span className="inline-flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn('w-4 h-4', avaliacoes.media != null && n <= Math.round(avaliacoes.media) ? 'fill-amber-400 text-amber-400' : 'text-tema-linha-forte')} />
              ))}
            </span>
          </div>
          <p className="text-[11px] text-tema-suave mt-1">
            {total} aprovada(s) · participação {avaliacoes.participacao != null ? `${avaliacoes.participacao}%` : '—'} dos {avaliacoes.finalizados} finalizados
          </p>
          {!!avaliacoes.pendentesAnalise && (
            <p className="text-[11px] text-amber-700">{avaliacoes.pendentesAnalise} aguardando análise do administrador (fora da média)</p>
          )}
          <p className="text-[11px] text-tema-suave">
            QR code {pct(avaliacoes.porCanal.QR ?? 0, total)}% · WhatsApp {pct(avaliacoes.porCanal.WHATSAPP ?? 0, total)}%
          </p>
          <p className="text-[11px] text-tema-suave">
            Resolvido {avaliacoes.resolucao.SIM ?? 0} · Em parte {avaliacoes.resolucao.PARCIAL ?? 0} · Não resolvido {avaliacoes.resolucao.NAO ?? 0}
          </p>
        </div>

        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((n) => {
            const qtd = avaliacoes.distribuicao[String(n)] ?? 0
            const p = pct(qtd, total)
            return (
              <div key={n} className="flex items-center gap-2 text-[11px]">
                <span className="w-3 text-tema-suave">{n}</span>
                <div className="flex-1 h-2 rounded-full bg-tema-contraste/[0.05] overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', n >= 4 ? 'bg-emerald-500' : n === 3 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${p}%` }}
                  />
                </div>
                <span className="w-16 text-right text-tema-suave">{qtd} ({p}%)</span>
              </div>
            )
          })}
        </div>
      </div>

      {rechamadas && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-tema-superficie border border-tema-linha rounded p-2">
            <p className="text-[11px] text-tema-apagado">Rechamadas confirmadas</p>
            <p className="text-sm font-bold text-tema-tinta">{rechamadas.confirmadas} ({rechamadas.percentualConfirmadas}%)</p>
          </div>
          <div className="bg-tema-superficie border border-tema-linha rounded p-2">
            <p className="text-[11px] text-tema-apagado">Aguardando validação</p>
            <p className="text-sm font-bold text-tema-tinta">{rechamadas.possiveis}</p>
          </div>
          <div className="bg-tema-superficie border border-tema-linha rounded p-2">
            <p className="text-[11px] text-tema-apagado">Descartadas</p>
            <p className="text-sm font-bold text-tema-tinta">{rechamadas.descartadas}</p>
          </div>
        </div>
      )}

      {avaliacoes.porEquipe.length > 0 && (
        <div>
          <p className="text-[11px] text-tema-apagado mb-1">Por equipe</p>
          <div className="space-y-0.5">
            {avaliacoes.porEquipe.map((e) => (
              <div key={e.equipe} className="flex justify-between text-xs bg-tema-superficie rounded px-2 py-1">
                <span className="text-tema-texto">{e.equipe}</span>
                <span className="text-tema-tinta"><strong>{e.media.toLocaleString('pt-BR')}</strong> <span className="text-tema-apagado">· {e.quantidade}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
