'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  Map, Truck, Wifi, WifiOff, Zap, ZapOff,
  AlertTriangle, RefreshCw, Clock, Navigation,
  Activity, Maximize2
} from 'lucide-react'
import { cn, formatSpeed, formatDateTime, getSpeedColor, timeAgo } from '@/lib/utils'
import type { VeiculoRastreado } from '@/types'
import Link from 'next/link'

type Aba = 'mapa' | 'lista' | 'alertas'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-tema-fundo flex items-center justify-center">
      <p className="text-tema-apagado text-sm">Carregando mapa...</p>
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

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

function normalizarPlaca(placa: string) {
  return placa.replace(/[-.\s]/g, '').toUpperCase()
}

async function fetchVehicles(): Promise<VeiculoRastreado[]> {
  const res = await fetch('/api/vehicles')
  if (!res.ok) throw new Error('Erro ao buscar veiculos')
  return res.json()
}

export function CentralMonitoramento() {
  const [aba, setAba] = useState<Aba>('mapa')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'online' | 'offline' | 'alerta'>('todos')

  const { data: veiculos = [], isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery({
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

  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Central de monitoramento</h1>
        <div className="card-orbia text-center py-14 px-4">
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar os veículos</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      </div>
    )
  }

  const cartoes = [
    { rotulo: 'Veículos online', valor: online, icone: Wifi, cor: 'bg-emerald-500/10 text-emerald-600' },
    { rotulo: 'Veículos offline', valor: offline, icone: WifiOff, cor: 'bg-tema-contraste/[0.06] text-tema-suave' },
    { rotulo: `Acima de ${VELOCIDADE_ALERTA} km/h`, valor: emAlerta, icone: AlertTriangle, cor: 'bg-red-500/10 text-red-600' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Central de monitoramento</h1>
        <div className="flex flex-wrap items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-tema-suave">
              Atualizado às {new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Link href="/tv" className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <Maximize2 className="w-4 h-4" aria-hidden />
            Modo TV
          </Link>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cartoes.map(c => {
          const Icone = c.icone
          return (
            <div key={c.rotulo} className="card-orbia flex items-center gap-3 px-4 py-3">
              <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', c.cor)}>
                <Icone className="w-5 h-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-tema-suave">{c.rotulo}</p>
                <p className="text-2xl font-bold leading-none tabular-nums text-tema-tinta mt-0.5">{isLoading ? '···' : c.valor}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Alerta de velocidade */}
      {emAlerta > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/[0.06] border border-red-500/25 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0" />
          <div>
            <p className="text-red-700 font-medium text-sm">
              {veiculosEnriquecidos.filter(v => v.alerta).map(v => v.equipe?.nome || v.nome).join(', ')} — velocidade acima de {VELOCIDADE_ALERTA} km/h!
            </p>
            <p className="text-tema-apagado text-xs mt-0.5">Verifique com o motorista imediatamente</p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div role="tablist" aria-label="Visões da central" className="flex items-center gap-1 border-b border-tema-linha overflow-x-auto">
        {abas.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                '-mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40',
                aba === a.id
                  ? 'border-orange-500 text-orange-700 font-semibold'
                  : 'border-transparent text-tema-suave hover:text-tema-tinta'
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
        <div className="card-orbia overflow-hidden" style={{ height: 'calc(100vh - 250px)', minHeight: 420 }}>
          <MapView height="100%" dashboard={false} />
        </div>
      )}

      {/* ABA LISTA DE VEICULOS */}
      {aba === 'lista' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: 'todos',   label: `Todos (${veiculos.length})` },
              { value: 'online',  label: `Online (${online})` },
              { value: 'offline', label: `Offline (${offline})` },
              { value: 'alerta',  label: `Alerta (${emAlerta})` },
            ].map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFiltroStatus(f.value as any)}
                aria-pressed={filtroStatus === f.value}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                  filtroStatus === f.value
                    ? 'bg-orange-500/10 text-orange-700 border-orange-500/40 font-semibold'
                    : 'bg-tema-superficie text-tema-suave hover:bg-tema-contraste/[0.03] border-tema-linha'
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
                      className={cn('card-orbia overflow-hidden', v.alerta && '!border-red-500/50')}
                    >
                      {/* Header colorido */}
                      <div className="px-4 py-3 flex items-center justify-between border-b border-tema-linha">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: equipe?.cor || '#6B7280' }} />
                          <span className="text-tema-tinta font-bold text-sm">{equipe?.nome || v.nome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {v.alerta && <AlertTriangle className="w-4 h-4 text-red-700" aria-hidden />}
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            v.online ? 'bg-emerald-500/15 text-emerald-700' : 'bg-tema-contraste/[0.05] text-tema-suave'
                          )}>
                            {v.online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Equipe info */}
                        {equipe && (
                          <div>
                            <p className="text-xs text-tema-apagado">{equipe.subNome}</p>
                            <p className="text-xs text-tema-apagado">{equipe.modelo} · {equipe.placa}</p>
                          </div>
                        )}

                        {/* Velocidade */}
                        <div className="bg-tema-contraste/[0.02] rounded-xl p-3 text-center">
                          <p className="text-3xl font-black font-mono" style={{ color: cor }}>
                            {Math.round(v.velocidade)}
                          </p>
                          <p className="text-xs text-tema-apagado">km/h</p>
                          {v.alerta && (
                            <p className="text-xs text-red-700 font-bold mt-1 flex items-center justify-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> ACIMA DO LIMITE
                            </p>
                          )}
                        </div>

                        {/* Detalhes */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-tema-contraste/[0.02] rounded-lg p-2">
                            <div className="flex items-center gap-1 text-tema-apagado mb-0.5">
                              {v.ignicao ? <Zap className="w-3 h-3 text-amber-700" /> : <ZapOff className="w-3 h-3" />}
                              <span>Ignicao</span>
                            </div>
                            <p className={cn('font-medium', v.ignicao ? 'text-amber-700' : 'text-tema-apagado')}>
                              {v.ignicao ? 'Ligada' : 'Desligada'}
                            </p>
                          </div>
                          <div className="bg-tema-contraste/[0.02] rounded-lg p-2">
                            <div className="flex items-center gap-1 text-tema-apagado mb-0.5">
                              <Navigation className="w-3 h-3" />
                              <span>Direcao</span>
                            </div>
                            <p className="text-tema-tinta font-medium">{v.direcao}°</p>
                          </div>
                        </div>

                        {/* Endereco */}
                        {v.endereco && (
                          <p className="text-xs text-tema-apagado truncate">{v.endereco}</p>
                        )}

                        {/* Ultima atualizacao */}
                        <div className="flex items-center gap-1 text-xs text-tema-apagado">
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
            <div className="card-orbia text-center py-14 px-4">
              <Activity className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
              <p className="font-medium text-tema-tinta">Nenhum alerta de velocidade</p>
              <p className="text-tema-apagado text-sm mt-1">Todos os veiculos estao dentro do limite de {VELOCIDADE_ALERTA} km/h</p>
            </div>
          ) : (
            <div className="space-y-3">
              {veiculosEnriquecidos.filter(v => v.alerta).map(v => {
                const cor = getSpeedColor(v.velocidade, VELOCIDADE_ALERTA)
                return (
                  <div key={v.id} className="card-orbia p-4 !border-red-500/40">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-6 h-6 text-red-700" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-tema-tinta font-bold">{v.equipe?.nome || v.nome}</p>
                          <AlertTriangle className="w-4 h-4 text-red-700" aria-hidden />
                        </div>
                        <p className="text-xs text-tema-suave">{v.equipe?.subNome} · {v.equipe?.placa}</p>
                        {v.endereco && <p className="text-xs text-tema-apagado mt-0.5">{v.endereco}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-3xl font-black font-mono" style={{ color: cor }}>
                          {Math.round(v.velocidade)}
                        </p>
                        <p className="text-xs text-tema-apagado">km/h</p>
                        <p className="text-xs text-red-700 font-bold">
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
          <div className="card-orbia p-4">
            <h3 className="text-sm font-semibold text-tema-tinta mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-600" />
              Status Atual de Todos os Veiculos
            </h3>
            <div className="space-y-2">
              {veiculosEnriquecidos.map(v => {
                const cor = getSpeedColor(v.velocidade, VELOCIDADE_ALERTA)
                return (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-tema-linha last:border-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: v.equipe?.cor || '#6B7280' }}
                      />
                      <div>
                        <p className="text-sm text-tema-tinta font-medium">{v.equipe?.nome || v.nome}</p>
                        <p className="text-xs text-tema-apagado">{v.equipe?.placa || v.placa}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-bold" style={{ color: cor }}>
                        {Math.round(v.velocidade)} km/h
                      </span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        v.online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-tema-contraste/[0.04] text-tema-suave'
                      )}>
                        {v.online ? 'Online' : 'Offline'}
                      </span>
                      <span className="text-xs text-tema-apagado">{timeAgo(v.ultimaAtualizacao)}</span>
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