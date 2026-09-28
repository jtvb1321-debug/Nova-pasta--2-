'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  Search, Loader2, AlertTriangle, CheckCircle2, Box, Cable,
  Waypoints, PanelRightClose, PanelRightOpen, ChevronRight, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ATRIBUICAO_CARTO, REFERRER_CARTO, obterChaveCarto, urlCarto } from '@/lib/basemap'
import { temaAtual, useTema } from '@/lib/tema'

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

// Consulta de viabilidade (prospeccao): CTO com porta livre perto do endereco.
// Distancias em linha reta; o cabo real segue as ruas e costuma ser maior.
const RAIO_VIAVEL = 200
const RAIO_CONFIRMAR = 400

interface OpcaoCto {
  nome: string
  distancia: number
  livres: number
  ativa: boolean // tem cliente ligado (caixa comprovadamente instalada)
}

type Precisao = 'exata' | 'rua' | 'bairro'

interface Consulta {
  rotulo: string
  precisao: Precisao
  nivel: 'viavel' | 'confirmar' | 'sem' | 'nao_encontrado'
  opcoes: OpcaoCto[]
  distanciaMaisProxima: number | null
}

const CONSULTA_NIVEL: Record<Consulta['nivel'], { rotulo: string; classe: string }> = {
  viavel: { rotulo: 'Tem viabilidade', classe: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
  confirmar: { rotulo: 'Viabilidade a confirmar', classe: 'bg-amber-500/10 text-amber-700 border-amber-500/25' },
  sem: { rotulo: 'Sem viabilidade', classe: 'bg-red-500/10 text-red-700 border-red-500/25' },
  nao_encontrado: { rotulo: 'Endereco nao encontrado', classe: 'bg-tema-contraste/[0.04] text-tema-suave border-tema-linha' },
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br'

async function buscarNominatim(parametros: string): Promise<{ lat: number; lng: number; precisao: Precisao } | null> {
  const res = await fetch(`${NOMINATIM}&${parametros}`, { referrerPolicy: 'strict-origin-when-cross-origin' })
  const lista = await res.json()
  const r = Array.isArray(lista) ? lista[0] : null
  if (!r) return null
  // Sem numero da casa o Nominatim devolve o meio da rua (ou o centro do bairro).
  const precisao: Precisao =
    r.addresstype === 'house' || r.type === 'house' || r.class === 'building' ? 'exata'
      : r.class === 'highway' || r.addresstype === 'road' ? 'rua'
        : 'bairro'
  return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), precisao }
}

// Coordenadas coladas ("-5.04, -42.74") ou link completo do Google Maps.
function extrairCoordenadas(texto: string): { lat: number; lng: number } | null {
  const padroes = [
    /^\s*(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)\s*$/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // posicao do marcador em links de lugar
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // centro da tela do Maps
    /[?&](?:q|ll|query)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/,
  ]
  for (const re of padroes) {
    const m = texto.match(re)
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

// Coordenada/link do Maps (exato), CEP -> rua/bairro (ViaCEP) -> Nominatim,
// ou endereco livre.
async function localizarEndereco(texto: string): Promise<{ lat: number; lng: number; precisao: Precisao; rotulo: string } | null> {
  const coord = extrairCoordenadas(texto)
  if (coord) return { ...coord, precisao: 'exata', rotulo: `Ponto ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}` }

  const cep = texto.replace(/\D/g, '')
  if (/^\d{5}-?\d{3}$/.test(texto.trim())) {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    const v = await res.json().catch(() => null)
    if (!v || v.erro) return null
    const rotulo = [v.logradouro, v.bairro, v.localidade].filter(Boolean).join(', ') || `CEP ${texto}`
    const enc = encodeURIComponent
    const ponto =
      (v.logradouro && await buscarNominatim(`street=${enc(v.logradouro)}&city=${enc(v.localidade)}&state=${enc(v.uf)}`)) ||
      (v.logradouro && await buscarNominatim(`q=${enc(`${v.logradouro}, ${v.bairro}, ${v.localidade}`)}`)) ||
      (v.bairro && await buscarNominatim(`q=${enc(`${v.bairro}, ${v.localidade}, ${v.uf}`)}`).then(p => p && { ...p, precisao: 'bairro' as Precisao }))
    return ponto ? { ...ponto, rotulo: `CEP ${texto.trim()} - ${rotulo}` } : null
  }
  const ponto = await buscarNominatim(`q=${encodeURIComponent(texto + ', Teresina, PI')}`)
  return ponto ? { ...ponto, rotulo: texto } : null
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
  const fundoRef = useRef<{ camada: any; chave: string } | null>(null)
  const tema = useTema()
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const consultaAtivaRef = useRef(false)
  const consultaCamadaRef = useRef<any>(null)
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
      const chaveCarto = await obterChaveCarto()

      if (!mapRef.current || mapInstance.current) return

      const map = L.map(mapRef.current, { zoomControl: false }).setView([-5.0892, -42.8019], 12)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      const fundo = L.tileLayer(urlCarto(temaAtual() === 'escuro' ? 'dark_all' : 'light_all', chaveCarto), {
        attribution: ATRIBUICAO_CARTO,
        referrerPolicy: REFERRER_CARTO,
        maxZoom: 19,
        className: 'gts-tiles-claro',
      } as any).addTo(map)
      fundoRef.current = { camada: fundo, chave: chaveCarto }

      mapInstance.current = map

      // Com uma consulta de viabilidade aberta, clicar no mapa consulta o ponto
      // exato (cliques em caixas/cabos continuam abrindo o popup deles).
      map.on('click', (e: any) => {
        if (!consultaAtivaRef.current) return
        const alvo = e.originalEvent?.target as HTMLElement | undefined
        if (alvo?.classList?.contains('leaflet-interactive')) return
        avaliarPonto(e.latlng.lat, e.latlng.lng, 'Ponto escolhido no mapa', 'exata')
      })

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
            ? '<p style="color:#7A7266; margin:4px 0;">Sem clientes vinculados</p>'
            : '<div style="max-height:160px; overflow-y:auto; margin-top:4px;">' +
              clientes.slice(0, 40).map((cl: any) =>
                '<div style="display:flex; align-items:center; gap:6px; padding:1px 0;">' +
                '<span style="width:7px; height:7px; border-radius:50%; flex-shrink:0; background:' + (cl.online ? '#00C853' : '#ef4444') + ';"></span>' +
                '<span style="font-size:12px;">' + cl.nome + '</span>' +
                '</div>'
              ).join('') +
              (clientes.length > 40 ? '<p style="font-size:11px; color:#7A7266; margin:2px 0;">+' + (clientes.length - 40) + ' outros</p>' : '') +
              '</div>'

          marker.bindPopup(
            '<div style="font-family: sans-serif; min-width: 200px;">' +
            (p.emAlerta ? '<b style="color:#ef4444;">⚠ Sem conexao (todos offline)</b><br/>' : '') +
            '<b>' + p.nome + '</b><br/>' +
            (p.projeto ? '<span style="color:#7A7266;">Projeto: ' + p.projeto + '</span><br/>' : '') +
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
              '<span style="color:' + (p.status === 'DOWN' ? '#ef4444' : '#047857') + '; font-weight:bold;">' +
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
            html: '<span style="display:block; width:11px; height:11px; background:' + cor + '; border:1.5px solid rgba(32,29,23,0.4); transform: rotate(45deg); box-shadow: 0 0 2px rgba(32,29,23,0.35);"></span>',
            iconSize: [11, 11],
            iconAnchor: [5, 5],
          })
          const marker = L.marker([lat, lng], { icon: icone })
          marker.bindPopup(
            '<div style="font-family: sans-serif; min-width: 160px;">' +
            '<b>' + p.nome + '</b><br/>' +
            (p.tipo ? '<span style="color:' + cor + ';">' + p.tipo + '</span><br/>' : '') +
            (p.projeto ? '<span style="color:#7A7266;">Projeto: ' + p.projeto + '</span>' : '') +
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

  // Fundo do mapa acompanha o tema claro/escuro.
  useEffect(() => {
    const f = fundoRef.current
    if (f) f.camada.setUrl(urlCarto(tema === 'escuro' ? 'dark_all' : 'light_all', f.chave))
  }, [tema])

  function focarAlerta(alerta: AlertaCaixa) {
    const { grupoCtos, marcadoresPorId } = camadasRef.current
    const marker = marcadoresPorId?.get(alerta.id)
    if (!marker || !grupoCtos) return
    grupoCtos.zoomToShowLayer(marker, () => marker.openPopup())
  }

  function limparMarcaConsulta() {
    const { map } = camadasRef.current
    if (map && consultaCamadaRef.current) map.removeLayer(consultaCamadaRef.current)
    consultaCamadaRef.current = null
  }

  function fecharConsulta() {
    limparMarcaConsulta()
    consultaAtivaRef.current = false
    setConsulta(null)
  }

  // Caixas com porta livre perto do ponto: ate 200 m com cliente ligado = viavel;
  // ate 400 m (ou so caixas ainda sem clientes) = a confirmar; alem disso = sem.
  function avaliarPonto(lat: number, lng: number, rotulo: string, precisao: Precisao) {
    const { L, map, marcadoresCtos } = camadasRef.current
    if (!L || !map) return

    const candidatas: OpcaoCto[] = (marcadoresCtos || [])
      .map((m: any) => {
        const p = m.feature?.properties || {}
        return {
          nome: p.nome || 'CTO',
          distancia: distanciaMetros(lat, lng, m._lat, m._lng),
          livres: Number(p.livres ?? 0),
          capacidade: Number(p.capacidade ?? 0),
          ativa: Number(p.totalLogins ?? 0) > 0,
        }
      })
      .filter((c: any) => c.capacidade > 0 && c.livres > 0)
      .sort((a: OpcaoCto, b: OpcaoCto) => a.distancia - b.distancia)

    const nivel: Consulta['nivel'] =
      candidatas.some(c => c.ativa && c.distancia <= RAIO_VIAVEL) ? 'viavel'
        : candidatas.some(c => c.distancia <= RAIO_CONFIRMAR) ? 'confirmar'
          : 'sem'

    limparMarcaConsulta()
    consultaCamadaRef.current = L.layerGroup([
      L.circle([lat, lng], { radius: RAIO_VIAVEL, color: '#EA580C', weight: 1.5, dashArray: '6 6', fillColor: '#EA580C', fillOpacity: 0.06, interactive: false }),
      L.circleMarker([lat, lng], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#EA580C', fillOpacity: 1, interactive: false }),
    ]).addTo(map)
    map.setView([lat, lng], Math.max(map.getZoom(), 17))

    consultaAtivaRef.current = true
    setConsulta({
      rotulo,
      precisao,
      nivel,
      opcoes: candidatas.filter(c => c.distancia <= RAIO_CONFIRMAR).slice(0, 3).map(({ nome, distancia, livres, ativa }) => ({ nome, distancia, livres, ativa })),
      distanciaMaisProxima: candidatas[0]?.distancia ?? null,
    })
  }

  async function buscarEndereco() {
    if (!busca.trim()) return
    setBuscando(true)
    try {
      const { grupoCtos, marcadoresCtos } = camadasRef.current
      const buscaLower = busca.toLowerCase()
      const ehConsultaDireta = /^\s*\d{5}-?\d{3}\s*$/.test(busca) || extrairCoordenadas(busca) !== null

      // 1. Busca interna: nome/endereco da propria caixa (CEP, coordenada e
      // link do Maps vao direto para a consulta de viabilidade)
      const encontrada = !ehConsultaDireta && marcadoresCtos.find((m: any) => {
        const p = m.feature?.properties
        const texto = ((p?.nome || '') + ' ' + (p?.endereco || '')).toLowerCase()
        return texto.includes(buscaLower)
      })

      if (encontrada) {
        grupoCtos.zoomToShowLayer(encontrada, () => encontrada.openPopup())
        setBuscando(false)
        return
      }

      // 2. CEP, coordenada, link do Maps ou endereco: localiza e consulta a viabilidade
      const local = await localizarEndereco(busca)
      if (local) {
        avaliarPonto(local.lat, local.lng, local.rotulo, local.precisao)
      } else {
        limparMarcaConsulta()
        consultaAtivaRef.current = true
        setConsulta({ rotulo: busca, precisao: 'exata', nivel: 'nao_encontrado', opcoes: [], distanciaMaisProxima: null })
      }
    } catch (err) {
      console.error('Erro na busca:', err)
    } finally {
      setBuscando(false)
    }
  }

  const stats = [
    { label: 'CTOs', valor: totalCaixas, icon: Box, cor: 'text-blue-700', bg: 'bg-blue-500/10' },
    { label: 'Em alerta', valor: alertas.length, icon: AlertTriangle, cor: alertas.length > 0 ? 'text-red-700' : 'text-tema-apagado', bg: alertas.length > 0 ? 'bg-red-500/10' : 'bg-tema-contraste/[0.03]' },
    { label: 'Cabos', valor: totalCabos, icon: Cable, cor: 'text-emerald-700', bg: 'bg-emerald-500/10' },
    { label: 'Cabos c/ problema', valor: cabosComProblema, icon: Cable, cor: cabosComProblema > 0 ? 'text-red-700' : 'text-tema-apagado', bg: cabosComProblema > 0 ? 'bg-red-500/10' : 'bg-tema-contraste/[0.03]' },
    { label: 'Emendas', valor: totalEmendas, icon: Waypoints, cor: 'text-purple-700', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className={cn('relative w-full flex bg-tema-fundo', telaCheia ? 'h-screen' : 'h-[calc(100vh-64px)]')}>
      {/* Coluna do mapa */}
      <div className="relative flex-1 min-w-0">
        <div ref={mapRef} className="absolute inset-0 z-0" />

        {/* Barra superior: busca */}
        <div className="absolute top-0 left-0 right-0 z-[1000] p-2 sm:p-3 flex flex-wrap items-center gap-2 bg-gradient-to-b from-tema-fundo/95 to-transparent">
          <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-tema-superficie/95 backdrop-blur border border-tema-linha rounded-lg px-3 py-3 sm:py-1.5 shadow-lg shadow-tema-contraste/[0.1]">
            <Search className="w-3.5 h-3.5 text-tema-apagado flex-shrink-0" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarEndereco()}
              placeholder="Buscar CEP, rua, CTO, coordenada ou link do Google Maps..."
              className="flex-1 min-w-0 bg-transparent text-tema-tinta text-sm outline-none placeholder:text-tema-apagado"
            />
            <button onClick={buscarEndereco} disabled={buscando} className="text-orange-600 hover:text-orange-500 disabled:opacity-50 flex-shrink-0">
              {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            onClick={() => setPainelAberto(v => !v)}
            className="relative flex items-center gap-1.5 px-3 py-3 sm:py-1.5 rounded-lg border border-tema-linha bg-tema-superficie/95 text-tema-suave hover:text-tema-tinta transition-colors flex-shrink-0"
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

        {/* Consulta de viabilidade (prospeccao) */}
        {consulta && (
          <div className="absolute top-16 sm:top-14 left-2 sm:left-3 z-[1000] w-[calc(100%-1rem)] sm:w-80 bg-tema-superficie/95 backdrop-blur border border-tema-linha rounded-lg shadow-lg shadow-tema-contraste/[0.1] p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md border', CONSULTA_NIVEL[consulta.nivel].classe)}>
                {CONSULTA_NIVEL[consulta.nivel].rotulo}
              </span>
              <button onClick={fecharConsulta} className="text-tema-apagado hover:text-tema-tinta" aria-label="Fechar consulta" title="Fechar consulta">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-tema-tinta font-medium mt-2 leading-snug">{consulta.rotulo}</p>

            {consulta.nivel === 'nao_encontrado' ? (
              <p className="text-xs text-tema-suave mt-1.5">
                Tente rua e bairro (ex.: Rua Tal, Bairro Tal) ou clique no mapa no local desejado.
              </p>
            ) : (
              <>
                {consulta.precisao !== 'exata' && (
                  <p className="text-xs text-amber-700 mt-1.5">
                    {consulta.precisao === 'rua' ? 'Local aproximado: meio da rua (sem o numero exato).' : 'Local aproximado: centro do bairro (a rua nao foi encontrada no mapa).'} Clique no mapa no ponto certo ou cole o link do Google Maps da casa.
                  </p>
                )}
                {consulta.opcoes.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {consulta.opcoes.map((o, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span className="min-w-0">
                          <span className="text-tema-tinta font-medium truncate block">{o.nome}</span>
                          {!o.ativa && <span className="text-tema-apagado">sem clientes - confirmar se esta instalada</span>}
                        </span>
                        <span className="text-right flex-shrink-0 font-mono">
                          <span className="text-tema-tinta block">{Math.round(o.distancia)} m</span>
                          <span className="text-emerald-700">{o.livres} {o.livres === 1 ? 'porta livre' : 'portas livres'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-tema-suave mt-2">
                    Nenhuma caixa com porta livre ate {RAIO_CONFIRMAR} m.
                    {consulta.distanciaMaisProxima !== null && ` A mais proxima fica a ${(consulta.distanciaMaisProxima / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km.`}
                  </p>
                )}
              </>
            )}
            <p className="text-[11px] text-tema-apagado mt-2.5 pt-2 border-t border-tema-linha">
              Distancia em linha reta (o cabo segue as ruas). Clique em outro ponto do mapa para consultar.
            </p>
          </div>
        )}

        {/* Legenda */}
        <div className="absolute bottom-3 left-2 sm:left-3 z-[1000] bg-tema-superficie/95 backdrop-blur border border-tema-linha rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5 text-[10px] sm:text-xs text-tema-texto space-y-1 sm:space-y-1.5 shadow-lg shadow-tema-contraste/[0.1] max-w-[160px] sm:max-w-none">
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
          <div className="absolute inset-0 z-[999] bg-tema-superficie/80 flex items-center justify-center">
            <div className="flex items-center gap-2 text-tema-tinta">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando rede do IXC...
            </div>
          </div>
        )}
      </div>

      {/* Painel lateral: estatisticas + problemas ativos.
          No celular ocupa a tela toda (overlay); no desktop fica ao lado do mapa. */}
      {painelAberto && (
        <div className="fixed inset-0 z-[1500] md:static md:z-auto md:w-80 flex-shrink-0 border-l border-tema-linha bg-tema-superficie flex flex-col">
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-tema-linha">
            <h2 className="text-sm font-semibold text-tema-tinta">Monitoramento da Rede</h2>
            <button
              onClick={() => setPainelAberto(false)}
              className="p-3 -m-1.5 rounded-lg hover:bg-tema-contraste/[0.04] text-tema-suave hover:text-tema-tinta"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 border-b border-tema-linha">
            {stats.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={i} className={cn('flex items-center gap-2 px-2.5 py-2 rounded-lg border border-tema-linha', s.bg)}>
                  <Icon className={cn('w-4 h-4 flex-shrink-0', s.cor)} />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-bold leading-tight', s.cor)}>{s.valor}</p>
                    <p className="text-[11px] text-tema-suave leading-tight truncate">{s.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-4 py-3 border-b border-tema-linha flex items-center gap-2">
            <AlertTriangle className={cn('w-4 h-4', alertas.length > 0 ? 'text-red-700' : 'text-tema-apagado')} />
            <h3 className="text-sm font-semibold text-tema-tinta">Problemas Ativos</h3>
            <span className={cn(
              'ml-auto text-xs font-bold px-2 py-0.5 rounded-full',
              alertas.length > 0 ? 'bg-red-500/15 text-red-700' : 'bg-tema-contraste/[0.03] text-tema-apagado'
            )}>
              {alertas.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-tema-linha">
            {carregando ? (
              <div className="p-4 flex items-center justify-center text-tema-apagado text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : alertas.length === 0 ? (
              <div className="p-6 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600/60" />
                <p className="text-sm text-tema-suave">Nenhum problema ativo</p>
                <p className="text-xs text-tema-apagado">Todas as CTOs monitoradas estao normais</p>
              </div>
            ) : (
              alertas
                .slice()
                .sort((a, b) => b.inativos - a.inativos)
                .map(a => (
                  <button
                    key={a.id}
                    onClick={() => focarAlerta(a)}
                    className="w-full text-left px-4 py-3 hover:bg-tema-contraste/[0.03] transition-colors flex items-start gap-2 group"
                  >
                    <span className="relative w-2 h-2 mt-1.5 flex-shrink-0">
                      <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
                      <span className="absolute inset-0 rounded-full bg-red-500" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-tema-tinta truncate">{a.nome}</p>
                      <p className="text-xs text-red-700 font-semibold">{a.inativos} de {a.totalLogins} clientes offline</p>
                      {a.endereco && <p className="text-xs text-tema-apagado truncate mt-0.5">{a.endereco}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-tema-apagado group-hover:text-tema-suave flex-shrink-0 mt-0.5" />
                  </button>
                ))
            )}
          </div>
        </div>
      )}

      <style>{`
        .gts-tiles-claro {
          filter: saturate(0.9);
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
          background-color: #FFFFFF !important;
          color: #201D17 !important;
          border-color: #E6E1D6 !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #FAF9F6 !important;
        }
      `}</style>
    </div>
  )
}
