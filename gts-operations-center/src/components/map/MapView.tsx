'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { VeiculoRastreado } from '@/types'
import { formatDateTime, formatSpeed, getSpeedColor } from '@/lib/utils'

const VELOCIDADE_ALERTA = 80

const EQUIPES_CONFIG = [
  { nome: 'Equipe 01', subNome: 'Alex e Bernardo', modelo: 'VW Saveiro',    placa: 'UKJ3J29', cor: '#2563EB' },
  { nome: 'Equipe 02', subNome: 'Heitor e Pedro',  modelo: 'VW Saveiro',    placa: 'HNP9017', cor: '#10B981' },
  { nome: 'Equipe 03', subNome: 'Higor',           modelo: 'Fiat Mobi',     placa: 'OPP3F19', cor: '#F59E0B' },
  { nome: 'Equipe 04', subNome: 'Kaio Felipe',     modelo: 'Chevrolet Celta',placa: 'NIL8195', cor: '#8B5CF6' },
  { nome: 'Apoio 01',  subNome: 'Veiculo de Apoio',modelo: 'Chevrolet Celta',placa: 'HGV9677', cor: '#EF4444' },
  { nome: 'Apoio 02',  subNome: 'Veiculo de Apoio',modelo: 'Mitsubishi L200',placa: 'APOIO02', cor: '#6B7280' },
]

const DEFAULT_CENTER: [number, number] = [-5.0892, -42.8016]

async function fetchVehicles(): Promise<VeiculoRastreado[]> {
  const res = await fetch('/api/vehicles')
  if (!res.ok) return []
  return res.json()
}

function normalizarPlaca(placa: string) {
  return placa.replace(/[-.\s]/g, '').toUpperCase()
}

interface MiniMapaProps {
  veiculo: VeiculoRastreado | undefined
  equipe: typeof EQUIPES_CONFIG[0]
  index: number
}

function MiniMapa({ veiculo, equipe, index }: MiniMapaProps) {
  const [mounted, setMounted] = useState(false)
  const [leafletLib, setLeafletLib] = useState<any>(null)
  const [mapComponents, setMapComponents] = useState<any>(null)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link)
    }
    Promise.all([
      import('leaflet'),
      import('react-leaflet'),
    ]).then(([leaflet, rl]) => {
      const L = leaflet.default
      delete (L.Icon.Default.prototype as any)._getIconUrl
      setLeafletLib(L)
      setMapComponents(rl)
      setMounted(true)
    })
  }, [])

  const temPosicao = veiculo && veiculo.latitude !== 0 && veiculo.longitude !== 0
  const centro: [number, number] = temPosicao
    ? [veiculo!.latitude, veiculo!.longitude]
    : DEFAULT_CENTER

  const alerta = veiculo && veiculo.velocidade > VELOCIDADE_ALERTA
  const cor = veiculo ? getSpeedColor(veiculo.velocidade, VELOCIDADE_ALERTA) : equipe.cor

  if (!mounted || !leafletLib || !mapComponents) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-1.5 flex items-center gap-2 border-b border-white/10 flex-shrink-0"
          style={{ backgroundColor: equipe.cor + '20' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: equipe.cor }} />
          <span className="text-xs font-bold text-white">{equipe.nome}</span>
          <span className="text-xs text-gray-400">- {equipe.subNome}</span>
        </div>
        <div className="flex-1 bg-[#0B1120] flex items-center justify-center">
          <p className="text-gray-600 text-xs">Carregando mapa...</p>
        </div>
      </div>
    )
  }

  const { MapContainer, TileLayer, Marker, Popup } = mapComponents

  const icon = leafletLib.divIcon({
    className: '',
    html: `<div style="
      background:${cor};
      border:2px solid white;
      border-radius:6px;
      padding:2px 6px;
      font-size:9px;
      font-weight:bold;
      color:white;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.6);
      ${alerta ? 'outline: 2px solid #EF4444;' : ''}
    ">
      ${equipe.nome} - ${equipe.placa}
    </div>`,
    iconSize: [110, 24],
    iconAnchor: [55, 12],
    popupAnchor: [0, -16],
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-2 py-1.5 flex items-center justify-between border-b border-white/10 flex-shrink-0"
        style={{ backgroundColor: equipe.cor + '20' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: equipe.cor }} />
          <span className="text-xs font-bold text-white">{equipe.nome}</span>
          <span className="text-xs text-gray-400 truncate">- {equipe.subNome}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {veiculo ? (
            <>
              <span className="text-xs font-mono font-bold" style={{ color: cor }}>
                {Math.round(veiculo.velocidade)} km/h
              </span>
              <span className={`text-xs px-1 py-0.5 rounded-full ${veiculo.online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                {veiculo.online ? 'Online' : 'Offline'}
              </span>
              {alerta && <span className="text-xs text-red-400 animate-pulse font-bold">ALERTA</span>}
            </>
          ) : (
            <span className="text-xs text-gray-600">Sem sinal GPS</span>
          )}
        </div>
      </div>

      {/* Mapa */}
      <div className="flex-1 min-h-0">
        <MapContainer
          key={`minimap-${index}`}
          center={centro}
          zoom={temPosicao ? 15 : 12}
          style={{ height: '100%', width: '100%', background: '#0B1120' }}
          zoomControl={false}
          attributionControl={false}
          scrollWheelZoom={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {temPosicao && (
            <Marker position={[veiculo!.latitude, veiculo!.longitude]} icon={icon}>
              <Popup>
                <div style={{ minWidth: 200, fontSize: 12, lineHeight: 1.6 }}>
                  <p style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 13, color: equipe.cor }}>
                    {equipe.nome}
                  </p>
                  <p>Equipe: {equipe.subNome}</p>
                  <p>Veiculo: {equipe.modelo}</p>
                  <p>Placa: {equipe.placa}</p>
                  {veiculo!.endereco && <p>Endereco: {veiculo!.endereco}</p>}
                  <p style={{ color: cor, fontWeight: 'bold' }}>
                    Velocidade: {formatSpeed(veiculo!.velocidade)}
                    {alerta && ' - ALERTA!'}
                  </p>
                  <p>Lat: {veiculo!.latitude.toFixed(5)}</p>
                  <p>Lng: {veiculo!.longitude.toFixed(5)}</p>
                  <p style={{ color: '#9CA3AF' }}>
                    Atualizado: {formatDateTime(veiculo!.ultimaAtualizacao)}
                  </p>
                  <p>
                    Status: {veiculo!.online
                      ? <span style={{ color: '#10B981' }}>Online</span>
                      : <span style={{ color: '#6B7280' }}>Offline</span>
                    }
                  </p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t border-white/5 bg-black/20 flex-shrink-0">
        <p className="text-xs text-gray-500 truncate">
          <span className="font-mono text-gray-400 font-bold">{equipe.placa}</span>
          {' - '}{equipe.modelo}
          {veiculo?.endereco && ` - ${veiculo.endereco}`}
        </p>
      </div>
    </div>
  )
}

interface MapViewProps {
  height?: string
  dashboard?: boolean
}

export default function MapView({ height = '100vh', dashboard = false }: MapViewProps) {
  const { data: veiculos = [] } = useQuery({
    queryKey: ['vehicles-map'],
    queryFn: fetchVehicles,
    refetchInterval: 30000,
  })

  // Vincular cada veículo à sua equipe pela placa
  function getVeiculoByPlaca(placa: string): VeiculoRastreado | undefined {
    const placaNorm = normalizarPlaca(placa)
    return veiculos.find(v => normalizarPlaca(v.placa) === placaNorm)
  }

  const gridClass = dashboard
    ? 'grid-cols-2 grid-rows-2'
    : 'grid-cols-2 grid-rows-3 lg:grid-cols-3 lg:grid-rows-2'

  const equipesMostradas = dashboard
    ? EQUIPES_CONFIG.slice(0, 4)
    : EQUIPES_CONFIG

  return (
    <div style={{ height, width: '100%' }} className={`grid ${gridClass}`}>
      {equipesMostradas.map((equipe, i) => (
        <div key={i} className="border border-white/5 overflow-hidden">
          <MiniMapa
            veiculo={getVeiculoByPlaca(equipe.placa)}
            equipe={equipe}
            index={i}
          />
        </div>
      ))}
    </div>
  )
}