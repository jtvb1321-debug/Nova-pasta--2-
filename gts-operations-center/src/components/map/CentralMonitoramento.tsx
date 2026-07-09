'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  Map, Truck, Wifi, WifiOff, Zap, ZapOff,
  AlertTriangle, RefreshCw, Clock, Navigation,
  Activity, Filter, Maximize2
} from 'lucide-react'
import { cn, formatSpeed, formatDateTime, getSpeedColor, timeAgo } from '@/lib/utils'
import type { VeiculoRastreado } from '@/types'
import Link from 'next/link'

type Aba = 'mapa' | 'lista' | 'alertas'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-[#0B1120] flex items-center justify-center">
      <p className="text-gray-500 text-sm">Carregando mapa...</p>
    </div>
  ),
})

const VELOCIDADE_ALERTA = parseInt(process.env.NEXT_PUBLIC_VELOCIDADE_ALERTA || '80')

const EQUIPES_CONFIG = [
  { nome: 'Equipe 01', subNome: 'Alex e Bernardo',  modelo: 'VW Saveiro',     placa: 'UKJ3J29', cor: '#2563EB' },
  { nome: 'Equipe 02', subNome: 'Heitor e Pedro',   modelo: 'VW Saveiro',     placa: 'HNP9017', cor: '#10B981' },
  { nome: 'Equipe 03', subNome: 'Higor',            modelo: 'Fiat Mobi',      placa: 'OPP3F19', cor: '#F59E0B' },
  { nome: 'Equipe 04', subNome: 'Kaio Felipe',      modelo: 'Celta',          placa: 'NIL8195', cor: '#8B5CF6' },
  { nome: 'Apoio 01',  subNome: 'Veiculo de Apoio', modelo: 'Celta',          placa: 'HGV9677', cor: '#EF4444' },
  { nome: 'Apoio 02',  subNome: 'Veiculo de Apoio', modelo: 'Mitsubishi L200',placa: 'APOIO02', cor: '#6B7280' },
]

function normalizarPlaca(placa: string) {
  return placa.replace(/[-.\s]/g, '').toUpperCase()
}

async function fetchVehicles(): Promise<VeiculoRastreado[]> {
  const res = await fetch('/api/vehicles')
  if (!res.ok) return []
  return res.json()
}

export function CentralMonitoramento() {
  const [aba, setAba] = useState<Aba>('mapa')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'online' | 'offline' | 'alerta'>('todos')

  const { data: veiculos = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['vehicles'],
    queryFn: fetchVehicles,
    refetchInterval: 30000,
  })

  function getEquipe(placa: string) {
    const norm = normalizarPlaca(placa)
    return EQUIPES_CONFIG.find(e => normalizarPlaca(e.placa) === norm)
  }

  // Enriquecer veiculos com dados da equipe
  const veiculosEnriquecidos = veiculos.map(v => ({
    ...v,
    equipe: getEquipe(v.placa),
    alerta: v.velocidade > VELOCIDADE_ALERTA,
  }))

  // Filtrar
  const veiculosFiltrados = veiculosEnriquecidos.filter(v => {
    if (filtroStatus === 'online') return v.online
    if (filtroStatus === 'offline') return !v.online
    if (filtroStatus === 'alerta') return v.alerta
    return true
  })

  const online = veiculos.filter(v => v.online).length
  const offline = veiculos.filter(v => !v.online).length
  const emAlerta = veiculos.filter(v => v.velocidade > VELOCIDADE_ALERTA).length

  const abas = [
    { id: 'mapa' as Aba,    label: 'Mapa',     icon: Map,      badge: 0 },
    { id: 'lista' as Aba,   label: 'Veiculos', icon: Truck,    badge: emAlerta },
    { id: 'alertas' as Aba, label: 'Alertas',  icon: AlertTriangle, badge: emAlerta },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Central de Monitoramento</h1>
          <p className="text-gray-500 text-sm mt-1">
            <span className="text-emerald-400 font-medium">{online} online</span>
            {' · '}
            <span className="text-gray-400">{offline} offline</span>
            {emAlerta > 0 && (
              <span className="ml-2 text-red-400 font-medium animate-pulse">
                · {emAlerta} em alerta de velocidade
              </span>
            )}
            {dataUpdatedAt && (
              <span className="ml-2 text-gray-600 text-xs">
                · Atualizado {timeAgo(new Date(dataUpdatedAt))}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/tv" className="gts-btn-secondary">
            <Maximize2 className="w-4 h-4" />
            Modo TV
          </Link>
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Alerta de velocidade */}
      {emAlerta > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 animate-pulse" />
          <div>
            <p className="text-red-400 font-medium text-sm">
              {veiculosEnriquecidos.filter(v => v.alerta).map(v => v.equipe?.nome || v.nome).join(', ')} — velocidade acima de {VELOCIDADE_ALERTA} km/h!
            </p>
            <p className="text-gray-500 text-xs mt-0.5">Verifique com o motorista imediatamente</p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-white/5">
        {abas.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                aba === a.id
                  ? 'border-gts-blue text-gts-blue'
                  : 'border-transparent text-gray-400 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {a.label}
              {a.badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-bold bg-red-500">
                  {a.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ABA MAPA */}
      {aba === 'mapa' && (
        <div className="gts-card p-0 overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
          <MapView height="100%" dashboard={false} />
        </div>
      )}

      {/* ABA LISTA DE VEICULOS */}
      {aba === 'lista' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            {[
              { value: 'todos',   label: `Todos (${veiculos.length})` },
              { value: 'online',  label: `Online (${online})` },
              { value: 'offline', label: `Offline (${offline})` },
              { value: 'alerta',  label: `Alerta (${emAlerta})` },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFiltroStatus(f.value as any)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  filtroStatus === f.value
                    ? 'bg-gts-blue/20 text-gts-blue border-gts-blue/30'
                    : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Grid de veiculos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-52 skeleton rounded-xl" />
                ))
              : veiculosFiltrados.map((v, i) => {
                  const cor = getSpeedColor(v.velocidade, VELOCIDADE_ALERTA)
                  const equipe = v.equipe

                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'bg-[#111827] border rounded-xl overflow-hidden transition-all',
                        v.alerta ? 'border-red-500/50' :
                        v.online ? 'border-emerald-500/20' : 'border-white/5'
                      )}
                    >
                      {/* Header colorido */}
                      <div
                        className="px-4 py-3 flex items-center justify-between"
                        style={{ backgroundColor: (equipe?.cor || '#6B7280') + '20' }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: equipe?.cor || '#6B7280' }} />
                          <span className="text-white font-bold text-sm">{equipe?.nome || v.nome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {v.alerta && <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />}
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            v.online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                          )}>
                            {v.online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Equipe info */}
                        {equipe && (
                          <div>
                            <p className="text-xs text-gray-500">{equipe.subNome}</p>
                            <p className="text-xs text-gray-600">{equipe.modelo} · {equipe.placa}</p>
                          </div>
                        )}

                        {/* Velocidade */}
                        <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                          <p className="text-3xl font-black font-mono" style={{ color: cor }}>
                            {Math.round(v.velocidade)}
                          </p>
                          <p className="text-xs text-gray-500">km/h</p>
                          {v.alerta && (
                            <p className="text-xs text-red-400 font-bold mt-1 animate-pulse">
                              ⚠️ ACIMA DO LIMITE
                            </p>
                          )}
                        </div>

                        {/* Detalhes */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/[0.03] rounded-lg p-2">
                            <div className="flex items-center gap-1 text-gray-500 mb-0.5">
                              {v.ignicao ? <Zap className="w-3 h-3 text-yellow-400" /> : <ZapOff className="w-3 h-3" />}
                              <span>Ignicao</span>
                            </div>
                            <p className={cn('font-medium', v.ignicao ? 'text-yellow-400' : 'text-gray-500')}>
                              {v.ignicao ? 'Ligada' : 'Desligada'}
                            </p>
                          </div>
                          <div className="bg-white/[0.03] rounded-lg p-2">
                            <div className="flex items-center gap-1 text-gray-500 mb-0.5">
                              <Navigation className="w-3 h-3" />
                              <span>Direcao</span>
                            </div>
                            <p className="text-white font-medium">{v.direcao}°</p>
                          </div>
                        </div>

                        {/* Endereco */}
                        {v.endereco && (
                          <p className="text-xs text-gray-500 truncate">{v.endereco}</p>
                        )}

                        {/* Ultima atualizacao */}
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Clock className="w-3 h-3" />
                          {timeAgo(v.ultimaAtualizacao)}
                        </div>
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      )}

      {/* ABA ALERTAS */}
      {aba === 'alertas' && (
        <div className="space-y-4">
          {emAlerta === 0 ? (
            <div className="gts-card text-center py-16">
              <Activity className="w-10 h-10 text-emerald-500/50 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhum alerta de velocidade ativo</p>
              <p className="text-gray-600 text-sm mt-1">Todos os veiculos estao dentro do limite de {VELOCIDADE_ALERTA} km/h</p>
            </div>
          ) : (
            <div className="space-y-3">
              {veiculosEnriquecidos.filter(v => v.alerta).map(v => {
                const cor = getSpeedColor(v.velocidade, VELOCIDADE_ALERTA)
                return (
                  <div key={v.id} className="bg-[#111827] border border-red-500/40 rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-6 h-6 text-red-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-bold">{v.equipe?.nome || v.nome}</p>
                          <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                        </div>
                        <p className="text-xs text-gray-400">{v.equipe?.subNome} · {v.equipe?.placa}</p>
                        {v.endereco && <p className="text-xs text-gray-500 mt-0.5">{v.endereco}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-3xl font-black font-mono" style={{ color: cor }}>
                          {Math.round(v.velocidade)}
                        </p>
                        <p className="text-xs text-gray-500">km/h</p>
                        <p className="text-xs text-red-400 font-bold">
                          +{Math.round(v.velocidade - VELOCIDADE_ALERTA)} acima
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Historico de todos os veiculos */}
          <div className="gts-card">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gts-blue" />
              Status Atual de Todos os Veiculos
            </h3>
            <div className="space-y-2">
              {veiculosEnriquecidos.map(v => {
                const cor = getSpeedColor(v.velocidade, VELOCIDADE_ALERTA)
                return (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: v.equipe?.cor || '#6B7280' }}
                      />
                      <div>
                        <p className="text-sm text-white font-medium">{v.equipe?.nome || v.nome}</p>
                        <p className="text-xs text-gray-500">{v.equipe?.placa || v.placa}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-bold" style={{ color: cor }}>
                        {Math.round(v.velocidade)} km/h
                      </span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        v.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'
                      )}>
                        {v.online ? 'Online' : 'Offline'}
                      </span>
                      <span className="text-xs text-gray-600">{timeAgo(v.ultimaAtualizacao)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}