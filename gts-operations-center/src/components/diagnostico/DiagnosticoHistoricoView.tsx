'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Activity, CheckCircle, AlertTriangle, XCircle, HelpCircle,
  ClipboardList, User, MapPin, Target,
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'

const CLASSIFICACAO_CFG: Record<string, { label: string; cor: string; icone: React.ElementType }> = {
  NORMAL:            { label: 'Normal',            cor: 'text-emerald-400 bg-emerald-500/10', icone: CheckCircle },
  ATENCAO:           { label: 'Atencao',           cor: 'text-yellow-400 bg-yellow-500/10',   icone: AlertTriangle },
  POSSIVEL_PROBLEMA: { label: 'Possivel Problema', cor: 'text-orange-400 bg-orange-500/10',   icone: AlertTriangle },
  PROBLEMA:          { label: 'Problema',          cor: 'text-red-400 bg-red-500/10',         icone: XCircle },
  INDETERMINADO:     { label: 'Indeterminado',     cor: 'text-gray-400 bg-gray-500/10',       icone: HelpCircle },
}

const ORIGEM_LABEL: Record<string, string> = {
  WIFI: 'Wi-Fi', DISPOSITIVO: 'Dispositivo', ROTEADOR: 'Roteador', ONU_ONT: 'ONU/ONT',
  FIBRA: 'Fibra', SINAL_OPTICO: 'Sinal Optico', REDE_LOCAL: 'Rede Local', REDE_GTSNET: 'Rede GTSNET',
  DNS: 'DNS', ROTA_EXTERNA: 'Rota Externa', SERVIDOR: 'Servidor', INDETERMINADO: 'Indeterminado',
}

async function fetchEstatisticas() {
  const res = await fetch('/api/diagnostico/estatisticas')
  if (!res.ok) return null
  return res.json()
}

async function fetchDiagnosticos(classificacao: string, page: number) {
  const q = new URLSearchParams({ limit: '20', page: String(page) })
  if (classificacao) q.set('classificacao', classificacao)
  const res = await fetch(`/api/diagnostico?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

async function fetchPrecisao() {
  const res = await fetch('/api/diagnostico/estatisticas?tipo=precisao')
  if (!res.ok) return null
  return res.json()
}

export function DiagnosticoHistoricoView() {
  const [aba, setAba] = useState<'historico' | 'precisao'>('historico')
  const [classificacao, setClassificacao] = useState('')
  const [page, setPage] = useState(1)

  const { data: stats } = useQuery({ queryKey: ['diagnostico-estatisticas'], queryFn: fetchEstatisticas, refetchInterval: 60000 })
  const { data, isLoading } = useQuery({
    queryKey: ['diagnosticos', classificacao, page],
    queryFn: () => fetchDiagnosticos(classificacao, page),
    refetchInterval: 30000,
    enabled: aba === 'historico',
  })
  const { data: precisao, isLoading: loadingPrecisao } = useQuery({
    queryKey: ['diagnostico-precisao'],
    queryFn: fetchPrecisao,
    refetchInterval: 60000,
    enabled: aba === 'precisao',
  })

  const diagnosticos = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  const kpisPorClassificacao = ['NORMAL', 'ATENCAO', 'POSSIVEL_PROBLEMA', 'PROBLEMA'].map(c => ({
    classificacao: c,
    quantidade: stats?.hojePorClassificacao?.find((x: any) => x.classificacao === c)?.quantidade ?? 0,
  }))

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-cyan-400" />
          Diagnostico Tecnico
        </h1>
        <p className="text-gray-500 text-sm mt-1">Diagnosticos de conexao executados pelas equipes em campo</p>
      </div>

      {/* KPIs do dia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpisPorClassificacao.map(kpi => {
          const cfg = CLASSIFICACAO_CFG[kpi.classificacao]
          const Icon = cfg.icone
          return (
            <div key={kpi.classificacao} className="gts-card">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', cfg.cor.split(' ')[1])}>
                <Icon className={cn('w-4 h-4', cfg.cor.split(' ')[0])} />
              </div>
              <p className={cn('text-2xl font-bold', cfg.cor.split(' ')[0])}>{kpi.quantidade}</p>
              <p className="text-xs text-gray-500 mt-1">{cfg.label} hoje</p>
            </div>
          )
        })}
      </div>

      {/* Problemas mais comuns */}
      {stats?.porOrigemProvavel?.length > 0 && (
        <div className="gts-card">
          <h2 className="text-sm font-semibold text-white mb-3">Origens mais frequentes</h2>
          <div className="flex flex-wrap gap-2">
            {stats.porOrigemProvavel.map((o: any) => (
              <span key={o.origem} className="text-xs px-3 py-1.5 bg-white/5 rounded-full text-gray-300">
                {ORIGEM_LABEL[o.origem] || o.origem} <strong className="text-white">{o.quantidade}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-white/5">
        {([
          { id: 'historico' as const, label: 'Historico' },
          { id: 'precisao' as const, label: 'Precisao NOC' },
        ]).map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              aba === a.id ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-white'
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'historico' && (
      <>
      {/* Filtro */}
      <div className="flex items-center gap-3">
        <select
          value={classificacao}
          onChange={e => { setClassificacao(e.target.value); setPage(1) }}
          className="gts-input text-sm"
        >
          <option value="">Todas as classificacoes</option>
          {Object.entries(CLASSIFICACAO_CFG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)
          : diagnosticos.length === 0
          ? (
            <div className="gts-card text-center py-16">
              <ClipboardList className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhum diagnostico encontrado</p>
            </div>
          )
          : diagnosticos.map((d: any) => {
            const cfg = CLASSIFICACAO_CFG[d.classificacao] || CLASSIFICACAO_CFG.INDETERMINADO
            const Icon = cfg.icone
            return (
              <div key={d.id} className="gts-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/agenda?chamadoId=${d.chamadoId}`} className="text-white font-semibold hover:text-cyan-400 hover:underline decoration-dotted">
                        {d.chamado?.cliente}
                      </Link>
                      <span className={cn('status-badge text-xs', cfg.cor)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      {d.fase === 'DEPOIS' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Depois</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {d.chamado?.cidade}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {d.funcionario?.nome || 'Sem tecnico'}
                      </span>
                      <span>Origem: {ORIGEM_LABEL[d.origemProvavel] || d.origemProvavel || '-'}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-600">{formatDateTime(d.createdAt)}</p>
                    {d.resultadoFinal && (
                      <p className="text-xs text-gray-500 mt-1">{d.resultadoFinal.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        }

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">Pagina {page} de {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
              >
                Proxima
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {aba === 'precisao' && (
        <div className="space-y-4">
          {loadingPrecisao ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
            </div>
          ) : !precisao || precisao.totalValidados === 0 ? (
            <div className="gts-card text-center py-16">
              <Target className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhum diagnostico remoto validado por tecnico ainda</p>
              <p className="text-gray-600 text-sm mt-1">A precisao e calculada a partir dos diagnosticos do NOC confirmados/corrigidos em campo</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="gts-card">
                  <p className="text-2xl font-bold text-emerald-400">{precisao.taxaConfirmacaoPct?.toFixed(0) ?? 0}%</p>
                  <p className="text-xs text-gray-500 mt-1">Taxa de confirmacao</p>
                </div>
                <div className="gts-card">
                  <p className="text-2xl font-bold text-cyan-400">{precisao.totalValidados}</p>
                  <p className="text-xs text-gray-500 mt-1">Diagnosticos validados</p>
                </div>
                <div className="gts-card">
                  <p className="text-2xl font-bold text-blue-400">{precisao.taxaResolvidoRemotamentePct?.toFixed(0) ?? 0}%</p>
                  <p className="text-xs text-gray-500 mt-1">Resolvidos sem visita</p>
                </div>
                <div className="gts-card">
                  <p className="text-2xl font-bold text-gray-300">{precisao.confiancaMediaConfirmado?.toFixed(0) ?? '-'}%</p>
                  <p className="text-xs text-gray-500 mt-1">Confianca media (confirmados)</p>
                </div>
              </div>

              {precisao.porClassificacao?.length > 0 && (
                <div className="gts-card">
                  <h2 className="text-sm font-semibold text-white mb-3">Por classificacao</h2>
                  <div className="flex flex-wrap gap-2">
                    {precisao.porClassificacao.map((c: any) => (
                      <span key={c.classificacao} className="text-xs px-3 py-1.5 bg-white/5 rounded-full text-gray-300">
                        {CLASSIFICACAO_CFG[c.classificacao]?.label || c.classificacao} <strong className="text-white">{c.quantidade}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {precisao.porOrigemProvavel?.length > 0 && (
                <div className="gts-card">
                  <h2 className="text-sm font-semibold text-white mb-3">Por origem provavel</h2>
                  <div className="flex flex-wrap gap-2">
                    {precisao.porOrigemProvavel.map((o: any) => (
                      <span key={o.origem} className="text-xs px-3 py-1.5 bg-white/5 rounded-full text-gray-300">
                        {ORIGEM_LABEL[o.origem] || o.origem} <strong className="text-white">{o.quantidade}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
