'use client'

import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { NOC } from './theme'

// Centro operacional fixo do NOC (sede/area de cobertura principal).
const CENTRO_PADRAO: [number, number] = [-5.042275450130424, -42.74770897772132]
const ZOOM_PADRAO = 14

interface CaixaFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string
    nome: string
    capacidade: number
    totalLogins: number
    livres: number
    ativos: number
    inativos: number
    emAlerta: boolean
    endereco: string | null
  }
}

interface CaboFeature {
  type: 'Feature'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: {
    id: string
    nome: string
    tipo: string | null
    projeto: string | null
    status: 'OK' | 'DOWN'
  }
}

async function fetchCtos() {
  const res = await fetch('/api/gts/mapa/ctos')
  if (!res.ok) throw new Error('Erro ao buscar CTOs')
  return res.json()
}

async function fetchCabos() {
  const res = await fetch('/api/gts/mapa/cabos')
  if (!res.ok) throw new Error('Erro ao buscar cabos')
  return res.json()
}

// FiberDocs nao expoe um campo estruturado de categoria do cabo - a
// classificacao Tronco/Backbone x Distribuicao e feita pelo nome do tipo
// cadastrado no projeto (convencao usada nos projetos FiberDocs da GTSNet).
function isCaboTronco(tipo: string | null): boolean {
  if (!tipo) return false
  const t = tipo.toLowerCase()
  return t.includes('tronco') || t.includes('backbone') || t.includes('troncal')
}

interface NetworkMapInnerProps {
  // No modo "TV" (telao da recepcao) escondemos as centenas de CTOs normais
  // e deixamos os cabos de distribuicao mais discretos, pra sobrar so a
  // topologia principal + os alertas reais - sem isso, a quantidade de
  // pontos/linhas em tela cheia vira uma "teia" visualmente poluida.
  modoTv?: boolean
}

export function NetworkMapInner({ modoTv = false }: NetworkMapInnerProps) {
  const { data: ctos } = useQuery({ queryKey: ['dashboard-mapa-ctos'], queryFn: fetchCtos, refetchInterval: 60000 })
  const { data: cabos } = useQuery({ queryKey: ['dashboard-mapa-cabos'], queryFn: fetchCabos, refetchInterval: 60000 })

  const features: CaixaFeature[] = ctos?.features ?? []
  const caboFeatures: CaboFeature[] = cabos?.features ?? []
  const ctosVisiveis = modoTv ? features.filter(f => f.properties.emAlerta) : features

  return (
    <MapContainer center={CENTRO_PADRAO} zoom={ZOOM_PADRAO} style={{ height: '100%', width: '100%', background: NOC.sidebar }} zoomControl={!modoTv}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        maxZoom={19}
      />

      {caboFeatures.map(c => {
        const tronco = isCaboTronco(c.properties.tipo)
        const emFalha = c.properties.status === 'DOWN'
        const cor = emFalha ? NOC.critico : tronco ? NOC.azulPrimario : NOC.sucesso
        const positions = c.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
        return (
          <Polyline
            key={c.properties.id}
            positions={positions}
            pathOptions={{
              color: cor,
              weight: emFalha ? 5 : tronco ? 4 : (modoTv ? 1.5 : 2.5),
              opacity: emFalha ? 0.95 : tronco ? 0.85 : (modoTv ? 0.35 : 0.9),
            }}
            className={emFalha ? 'gts-pulso-critico' : undefined}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-bold">{c.properties.nome}</p>
                <p>{tronco ? 'Cabo Tronco (Backbone)' : 'Distribuicao / Acesso'}</p>
                {emFalha && <p className="text-red-600 font-semibold">Possivel rompimento</p>}
              </div>
            </Popup>
          </Polyline>
        )
      })}

      {ctosVisiveis.map(f => {
        const cor = f.properties.emAlerta ? NOC.critico : f.properties.inativos > 0 ? NOC.alerta : NOC.sucesso
        return (
          <CircleMarker
            key={f.properties.id}
            center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
            radius={f.properties.emAlerta ? 9 : 5}
            pathOptions={{ color: cor, fillColor: cor, fillOpacity: 0.8, weight: f.properties.emAlerta ? 3 : 1 }}
            className={f.properties.emAlerta ? 'gts-pulso-critico' : undefined}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-bold">{f.properties.nome}</p>
                <p>{f.properties.ativos} ativos / {f.properties.capacidade} vagas</p>
                {f.properties.emAlerta && <p className="text-red-600 font-semibold">Rota em alerta</p>}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
