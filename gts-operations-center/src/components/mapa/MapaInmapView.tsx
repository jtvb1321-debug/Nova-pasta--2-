'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  Search, Loader2, AlertTriangle, CheckCircle2, Box, Cable,
  Waypoints, PanelRightClose, PanelRightOpen, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Cor real da caixa de emenda, igual o tecnico ve em campo.
const COR_EMENDA: Record<string, string> = {
  'Caixa de Emenda Preta': '#1f2937',
  'Caixa de Emenda Laranja': '#f97316',
  'Caixa de Emenda Vermelha': '#ef4444',
  'Caixa de Emenda Amarela': '#eab308',
  'Caixa de Emenda Azul Claro': '#38bdf8',
  'Caixa de Emenda Azul Escuro': '#1d4ed8',
  'Caixa de Emenda Roxa': '#a855f7',
  'Caixa de Emenda Limão': '#84cc16',
  'Caixa de Emenda Branca': '#f8fafc',
  'Caixa de Emenda Lilás': '#c084fc',
}
const COR_EMENDA_PADRAO = '#9ca3af'

interface AlertaCaixa {
  id: string
  nome: string
  lat: number
  lng: number
  ativos: number
  inativos: number
  totalLogins: number
  endereco: string | null
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const rad = (n: number) => (n * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface Props {
  // Tela do tecnico: sem AppShell, entao o mapa deve ocupar 100% da altura
  // da tela (nao h-[calc(100vh-64px)], que reserva espaco de um cabecalho
  // que nao existe nesse caso).
  telaCheia?: boolean
}

export function MapaInmapView({ telaCheia = false }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const camadasRef = useRef<any>({})
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [painelAberto, setPainelAberto] = useState(!telaCheia)
  const [totalCaixas, setTotalCaixas] = useState(0)
  const [totalCabos, setTotalCabos] = useState(0)
  const [cabosComProblema, setCabosComProblema] = useState(0)
  const [totalEmendas, setTotalEmendas] = useState(0)
  const [alertas, setAlertas] = useState<AlertaCaixa[]>([])

  useEffect(() => {
    let ativo = true

    async function iniciar() {
      const L = await import('leaflet')
      ;(window as any).L = L
      await import('leaflet.markercluster')

      if (!mapRef.current || mapInstance.current) return

      const map = L.map(mapRef.current, { zoomControl: false }).setView([-5.0892, -42.8019], 12)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
        className: 'gts-tiles-escuro',
      } as any).addTo(map)

      mapInstance.current = map

      const grupoCtos = (L as any).markerClusterGroup({
        maxClusterRadius: 50,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: false,
        iconCreateFunction: (cluster: any) => {
          const filhos = cluster.getAllChildMarkers()
          const temAlerta = filhos.some((m: any) => m.options.emAlerta)
          const qtd = cluster.getChildCount()
          const cor = temAlerta ? '#ef4444' : '#00C853'
          return L.divIcon({
            html: '<div style="' +
              'display:flex; align-items:center; justify-content:center;' +
              'width:34px; height:34px; border-radius:50%;' +
              'background:' + cor + '22; border:2px solid ' + cor + ';' +
              'color:' + cor + '; font-weight:700; font-size:12px; font-family:sans-serif;' +
              (temAlerta ? 'box-shadow:0 0 8px ' + cor + '99;' : '') +
              '">' + qtd + '</div>',
            className: 'gts-cluster-icon',
            iconSize: [34, 34],
          })
        },
      })
      const marcadoresPorId = new Map<string, any>()
      camadasRef.current = { L, map, grupoCtos, marcadoresPorId, marcadoresCtos: [] as any[] }

      try {
        const resCtos = await fetch('/api/gts/mapa/ctos')
        const geoCtos = await resCtos.json()
        if (!ativo) return

        const listaAlertas: AlertaCaixa[] = []

        for (const feature of geoCtos.features || []) {
          const [lng, lat] = feature.geometry.coordinates
          const p = feature.properties

          let marker: any
          if (p.emAlerta) {
            const icone = L.divIcon({
              className: 'gts-caixa-alerta-icon',
              html: '<span class="gts-alerta-pulso"></span><span class="gts-alerta-ponto"></span>',
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            })
            marker = L.marker([lat, lng], { icon: icone, zIndexOffset: 1000, emAlerta: true } as any)
            listaAlertas.push({
              id: p.id, nome: p.nome, lat, lng,
              ativos: p.ativos, inativos: p.inativos, totalLogins: p.totalLogins,
              endereco: p.endereco,
            })
          } else {
            marker = L.circleMarker([lat, lng], {
              radius: 5, color: '#0a3d1f', weight: 1, fillColor: '#00C853', fillOpacity: 0.9,
              emAlerta: false,
            } as any)
          }

          const clientes = p.clientes || []
          const listaClientes = clientes.length === 0
            ? '<p style="color:#9ca3af; margin:4px 0;">Sem clientes vinculados</p>'
            : '<div style="max-height:160px; overflow-y:auto; margin-top:4px;">' +
              clientes.slice(0, 40).map((cl: any) =>
                '<div style="display:flex; align-items:center; gap:6px; padding:1px 0;">' +
                '<span style="width:7px; height:7px; border-radius:50%; flex-shrink:0; background:' + (cl.online ? '#00C853' : '#ef4444') + ';"></span>' +
                '<span style="font-size:12px;">' + cl.nome + '</span>' +
                '</div>'
              ).join('') +
              (clientes.length > 40 ? '<p style="font-size:11px; color:#9ca3af; margin:2px 0;">+' + (clientes.length - 40) + ' outros</p>' : '') +
              '</div>'

          marker.bindPopup(
            '<div style="font-family: sans-serif; min-width: 200px;">' +
            (p.emAlerta ? '<b style="color:#ef4444;">⚠ Sem conexao (todos offline)</b><br/>' : '') +
            '<b>' + p.nome + '</b><br/>' +
            (p.projeto ? '<span style="color:#9ca3af;">Projeto: ' + p.projeto + '</span><br/>' : '') +
            (p.endereco ? p.endereco + '<br/>' : '') +
            'Capacidade: ' + p.capacidade + ' - Portas livres: ' + p.livres + '<br/>' +
            '<b>Clientes (' + p.ativos + ' online / ' + p.inativos + ' offline):</b>' +
            listaClientes +
            '<a href="https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '" target="_blank" ' +
            'style="display:inline-block;margin-top:8px;padding:10px 16px;background:#00C853;color:white;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Navegar ate aqui</a>' +
            '</div>'
          )
          ;(marker as any).feature = feature
          ;(marker as any)._lat = lat
          ;(marker as any)._lng = lng
          grupoCtos.addLayer(marker)
          camadasRef.current.marcadoresCtos.push(marker)
          marcadoresPorId.set(p.id, marker)
        }

        setTotalCaixas(geoCtos.features?.length || 0)
        setAlertas(listaAlertas)
      } catch (err) {
        console.error('Erro ao carregar caixas:', err)
      }

      grupoCtos.addTo(map)

      try {
        const resCabos = await fetch('/api/gts/mapa/cabos')
        const geoCabos = await resCabos.json()
        if (!ativo) return

        let problemas = 0
        const camadaCabos = L.geoJSON(geoCabos, {
          style: (feature: any) => {
            const emAlerta = feature?.properties?.status === 'DOWN'
            if (emAlerta) problemas++
            return {
              color: emAlerta ? '#FF0000' : '#00C853',
              weight: emAlerta ? 5 : 3,
              opacity: 0.9,
              className: emAlerta ? 'gts-cabo-alerta' : 'gts-cabo-ok',
            }
          },
          onEachFeature: (feature: any, layer: any) => {
            const p = feature.properties || {}
            layer.bindPopup(
              '<div style="font-family: sans-serif; min-width: 160px;">' +
              '<b>' + (p.nome || 'Cabo') + '</b><br/>' +
              (p.tipo ? p.tipo + '<br/>' : '') +
              '<span style="color:' + (p.status === 'DOWN' ? '#ef4444' : '#34d399') + '; font-weight:bold;">' +
              (p.status === 'DOWN' ? 'Possivel rompimento' : 'Normal') +
              '</span></div>'
            )
          },
        })
        camadaCabos.addTo(map)
        setTotalCabos(geoCabos.features?.length || 0)
        setCabosComProblema(problemas)
      } catch (err) {
        console.error('Erro ao carregar cabos:', err)
      }

      try {
        const resEmendas = await fetch('/api/gts/mapa/emendas')
        const geoEmendas = await resEmendas.json()
        if (!ativo) return

        const grupoEmendas = L.layerGroup()
        for (const feature of geoEmendas.features || []) {
          const [lng, lat] = feature.geometry.coordinates
          const p = feature.properties || {}
          const cor = COR_EMENDA[p.tipo] || COR_EMENDA_PADRAO

          const icone = L.divIcon({
            className: 'gts-emenda-icon',
            html: '<span style="display:block; width:11px; height:11px; background:' + cor + '; border:1.5px solid rgba(0,0,0,0.5); transform: rotate(45deg); box-shadow: 0 0 2px rgba(0,0,0,0.6);"></span>',
            iconSize: [11, 11],
            iconAnchor: [5, 5],
          })
          const marker = L.marker([lat, lng], { icon: icone })
          marker.bindPopup(
            '<div style="font-family: sans-serif; min-width: 160px;">' +
            '<b>' + p.nome + '</b><br/>' +
            (p.tipo ? '<span style="color:' + cor + ';">' + p.tipo + '</span><br/>' : '') +
            (p.projeto ? '<span style="color:#9ca3af;">Projeto: ' + p.projeto + '</span>' : '') +
            '</div>'
          )
          grupoEmendas.addLayer(marker)
        }
        grupoEmendas.addTo(map)
        setTotalEmendas(geoEmendas.features?.length || 0)
      } catch (err) {
        console.error('Erro ao carregar emendas:', err)
      }

      setCarregando(false)
    }

    iniciar()
    return () => { ativo = false }
  }, [])

  function focarAlerta(alerta: AlertaCaixa) {
    const { grupoCtos, marcadoresPorId } = camadasRef.current
    const marker = marcadoresPorId?.get(alerta.id)
    if (!marker || !grupoCtos) return
    grupoCtos.zoomToShowLayer(marker, () => marker.openPopup())
  }

  async function buscarEndereco() {
    if (!busca.trim()) return
    setBuscando(true)
    try {
      const { map, grupoCtos, marcadoresCtos } = camadasRef.current
      const buscaLower = busca.toLowerCase()

      // 1. Busca interna: nome/endereco da propria caixa
      const encontrada = marcadoresCtos.find((m: any) => {
        const p = m.feature?.properties
        const texto = ((p?.nome || '') + ' ' + (p?.endereco || '')).toLowerCase()
        return texto.includes(buscaLower)
      })

      if (encontrada) {
        grupoCtos.zoomToShowLayer(encontrada, () => encontrada.openPopup())
        setBuscando(false)
        return
      }

      // 2. Geocoding externo (rua/endereco) + acha a caixa mais proxima
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(busca + ', Teresina, PI'))
      const resultados = await res.json()

      if (resultados && resultados.length > 0) {
        const { lat, lon } = resultados[0]
        const latN = parseFloat(lat)
        const lngN = parseFloat(lon)

        let maisProxima: any = null
        let menorDistancia = Infinity
        for (const m of marcadoresCtos) {
          const d = distanciaMetros(latN, lngN, m._lat, m._lng)
          if (d < menorDistancia) { menorDistancia = d; maisProxima = m }
        }

        if (maisProxima && menorDistancia < 2000) {
          setTimeout(() => grupoCtos.zoomToShowLayer(maisProxima, () => maisProxima.openPopup()), 300)
        } else {
          map.setView([latN, lngN], 17)
        }
      }
    } catch (err) {
      console.error('Erro na busca:', err)
    } finally {
      setBuscando(false)
    }
  }

  const stats = [
    { label: 'CTOs', valor: totalCaixas, icon: Box, cor: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Em alerta', valor: alertas.length, icon: AlertTriangle, cor: alertas.length > 0 ? 'text-red-400' : 'text-gray-500', bg: alertas.length > 0 ? 'bg-red-500/10' : 'bg-white/5' },
    { label: 'Cabos', valor: totalCabos, icon: Cable, cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Cabos c/ problema', valor: cabosComProblema, icon: Cable, cor: cabosComProblema > 0 ? 'text-red-400' : 'text-gray-500', bg: cabosComProblema > 0 ? 'bg-red-500/10' : 'bg-white/5' },
    { label: 'Emendas', valor: totalEmendas, icon: Waypoints, cor: 'text-purple-400', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className={cn('relative w-full flex bg-[#0B1120]', telaCheia ? 'h-screen' : 'h-[calc(100vh-64px)]')}>
      {/* Coluna do mapa */}
      <div className="relative flex-1 min-w-0">
        <div ref={mapRef} className="absolute inset-0 z-0" />

        {/* Barra superior: busca */}
        <div className="absolute top-0 left-0 right-0 z-[1000] p-2 sm:p-3 flex flex-wrap items-center gap-2 bg-gradient-to-b from-[#0B1120]/95 to-transparent">
          <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-[#111827]/95 backdrop-blur border border-white/10 rounded-lg px-3 py-3 sm:py-1.5 shadow-lg">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarEndereco()}
              placeholder="Buscar rua, CTO ou endereco..."
              className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none placeholder:text-gray-500"
            />
            <button onClick={buscarEndereco} disabled={buscando} className="text-orange-400 hover:text-orange-300 disabled:opacity-50 flex-shrink-0">
              {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            onClick={() => setPainelAberto(v => !v)}
            className="relative flex items-center gap-1.5 px-3 py-3 sm:py-1.5 rounded-lg border border-white/10 bg-[#111827]/95 text-gray-300 hover:text-white transition-colors flex-shrink-0"
            title={painelAberto ? 'Ocultar painel de problemas' : 'Mostrar painel de problemas'}
          >
            {painelAberto ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            {!painelAberto && alertas.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {alertas.length}
              </span>
            )}
          </button>
        </div>

        {/* Legenda */}
        <div className="absolute bottom-3 left-2 sm:left-3 z-[1000] bg-[#111827]/95 backdrop-blur border border-white/10 rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5 text-[10px] sm:text-xs text-gray-300 space-y-1 sm:space-y-1.5 shadow-lg max-w-[160px] sm:max-w-none">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#00C853] flex-shrink-0" /> CTO normal
          </div>
          <div className="flex items-center gap-2">
            <span className="relative w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0">
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
              <span className="absolute inset-0 rounded-full bg-red-500" />
            </span>
            CTO sem conexao
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#00C853] flex-shrink-0" /> Cabo normal
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#FF0000] flex-shrink-0" /> Cabo com rompimento
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0" style={{ background: '#9ca3af', transform: 'rotate(45deg)' }} /> Emenda (cor real)
          </div>
        </div>

        {carregando && (
          <div className="absolute inset-0 z-[999] bg-[#0B1120]/80 flex items-center justify-center">
            <div className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando rede do IXC...
            </div>
          </div>
        )}
      </div>

      {/* Painel lateral: estatisticas + problemas ativos.
          No celular ocupa a tela toda (overlay); no desktop fica ao lado do mapa. */}
      {painelAberto && (
        <div className="fixed inset-0 z-[1500] md:static md:z-auto md:w-80 flex-shrink-0 border-l border-white/10 bg-[#0B1120] flex flex-col">
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">Monitoramento da Rede</h2>
            <button
              onClick={() => setPainelAberto(false)}
              className="p-3 -m-1.5 rounded-lg hover:bg-white/5 text-gray-300 hover:text-white"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 border-b border-white/10">
            {stats.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={i} className={cn('flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/10', s.bg)}>
                  <Icon className={cn('w-4 h-4 flex-shrink-0', s.cor)} />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-bold leading-tight', s.cor)}>{s.valor}</p>
                    <p className="text-[11px] text-gray-400 leading-tight truncate">{s.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <AlertTriangle className={cn('w-4 h-4', alertas.length > 0 ? 'text-red-400' : 'text-gray-500')} />
            <h3 className="text-sm font-semibold text-white">Problemas Ativos</h3>
            <span className={cn(
              'ml-auto text-xs font-bold px-2 py-0.5 rounded-full',
              alertas.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-gray-500'
            )}>
              {alertas.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {carregando ? (
              <div className="p-4 flex items-center justify-center text-gray-500 text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : alertas.length === 0 ? (
              <div className="p-6 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                <p className="text-sm text-gray-400">Nenhum problema ativo</p>
                <p className="text-xs text-gray-600">Todas as CTOs monitoradas estao normais</p>
              </div>
            ) : (
              alertas
                .slice()
                .sort((a, b) => b.inativos - a.inativos)
                .map(a => (
                  <button
                    key={a.id}
                    onClick={() => focarAlerta(a)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-start gap-2 group"
                  >
                    <span className="relative w-2 h-2 mt-1.5 flex-shrink-0">
                      <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                      <span className="absolute inset-0 rounded-full bg-red-500" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{a.nome}</p>
                      <p className="text-xs text-red-400 font-semibold">{a.inativos} de {a.totalLogins} clientes offline</p>
                      {a.endereco && <p className="text-xs text-gray-500 truncate mt-0.5">{a.endereco}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 mt-0.5" />
                  </button>
                ))
            )}
          </div>
        </div>
      )}

      <style>{`
        .gts-tiles-escuro {
          filter: brightness(1.5) contrast(0.9) saturate(0.85);
        }
        .gts-cluster-icon { transition: transform 0.15s ease; }
        .gts-cluster-icon:hover { transform: scale(1.08); }
        .marker-cluster { background: transparent !important; }
        .gts-cabo-alerta {
          animation: gts-cabo-pulso 1.1s ease-in-out infinite;
        }
        @keyframes gts-cabo-pulso {
          0%, 100% { stroke-opacity: 1; }
          50% { stroke-opacity: 0.35; }
        }
        .gts-caixa-alerta-icon { position: relative; }
        .gts-alerta-ponto {
          position: absolute; top: 7px; left: 7px; width: 8px; height: 8px;
          border-radius: 50%; background: #ff1744; box-shadow: 0 0 4px #ff1744;
        }
        .gts-alerta-pulso {
          position: absolute; top: 0; left: 0; width: 22px; height: 22px;
          border-radius: 50%; background: rgba(255, 23, 68, 0.45);
          animation: gts-alerta-expandir 1.4s ease-out infinite;
        }
        @keyframes gts-alerta-expandir {
          0% { transform: scale(0.4); opacity: 0.9; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .leaflet-control-zoom a {
          background-color: #111827 !important;
          color: #e5e7eb !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #1f2937 !important;
        }
      `}</style>
    </div>
  )
}
