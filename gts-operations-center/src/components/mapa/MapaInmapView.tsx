'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  Search, Loader2, AlertTriangle, CheckCircle2, Box, Cable,
  Waypoints, PanelRightClose, PanelRightOpen, ChevronRight, X, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ATRIBUICAO_CARTO, CROSS_ORIGIN_CARTO, REFERRER_CARTO, obterChaveCarto, urlCarto } from '@/lib/basemap'
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

// trecho = consulta pela rua inteira (todos os trechos dela no bairro escolhido)
type Precisao = 'exata' | 'rua' | 'trecho' | 'bairro'

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

// ---------------------------------------------------------------- Busca por nome de rua
// 1. ViaCEP (Correios) lista as ruas de Teresina com aquele nome, por bairro.
// 2. A pessoa escolhe; o Nominatim devolve o desenho da rua naquele bairro.
// 3. A viabilidade considera caixas perto de qualquer trecho da rua.

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// O ViaCEP nao entende abreviacao ("Av Frei Serafim" nao acha nada).
const ABREVIACOES_RUA = /^(av|av\.|r|r\.|tv|tv\.|trav|trav\.|pc|pç|pca|pça|pc\.|al|al\.|rod|rod\.|est|est\.)\s+/i
// Para comparar o nome dos Correios com o do mapa ("Rua Anísio de Abreu" = "Rua Anisio de Abreu").
const TIPOS_RUA = /^(rua|avenida|travessa|alameda|praca|estrada|rodovia|quadra|vila|conjunto|residencial|av|r|tv)\.?\s+/

const nucleoRua = (t: string) => semAcento(t).replace(TIPOS_RUA, '').replace(/\s+/g, ' ')

interface RuaEncontrada {
  logradouro: string
  bairro: string
  cep: string
  faixas: string[] // ex.: "lado par", "de 966 a 1202"
}

// "Sao Jose" | "Rua Sao Jose, 123" | "Sao Jose, Parque Brasil" | "Sao Jose, 123, Parque Brasil"
function separarBusca(texto: string): { rua: string; numero: string | null; bairro: string } {
  const partes = texto.split(',').map(p => p.trim()).filter(Boolean)
  const rua = (partes[0] || '').replace(ABREVIACOES_RUA, '')
  const resto = partes.slice(1)
  const numero = resto.find(p => /^(n[ºo°.]?\s*)?\d{1,5}[a-z]?$/i.test(p))?.replace(/\D+$/, '').replace(/^\D+/, '') || null
  const bairro = resto.filter(p => !/^(n[ºo°.]?\s*)?\d{1,5}[a-z]?$/i.test(p) && !/^teresina$|^pi$/i.test(p)).join(' ')
  return { rua, numero, bairro }
}

async function buscarRuasViaCep(rua: string, bairro: string): Promise<RuaEncontrada[]> {
  if (rua.trim().length < 3) return []
  const res = await fetch(`https://viacep.com.br/ws/PI/Teresina/${encodeURIComponent(rua.trim())}/json/`).catch(() => null)
  const lista = res?.ok ? await res.json().catch(() => []) : []
  if (!Array.isArray(lista)) return []
  // O mesmo trecho aparece com varios CEPs (lado par/impar, faixas de numero).
  const porRua = new Map<string, RuaEncontrada>()
  for (const v of lista) {
    if (!v?.logradouro) continue
    const chave = semAcento(`${v.logradouro}|${v.bairro || ''}`)
    const atual: RuaEncontrada = porRua.get(chave) || { logradouro: v.logradouro, bairro: v.bairro || '', cep: v.cep, faixas: [] }
    if (v.complemento && !atual.faixas.includes(v.complemento)) atual.faixas.push(v.complemento)
    porRua.set(chave, atual)
  }
  const filtroBairro = semAcento(bairro)
  // Nome exato primeiro ("Rua Sao Jose"), depois os que comecam igual, depois o resto.
  const buscado = nucleoRua(rua)
  const ordem = (r: RuaEncontrada) => { const n = nucleoRua(r.logradouro); return n === buscado ? 0 : n.startsWith(buscado) ? 1 : 2 }
  return [...porRua.values()]
    .filter(r => !filtroBairro || semAcento(r.bairro).includes(filtroBairro))
    .sort((a, b) => ordem(a) - ordem(b) || a.logradouro.localeCompare(b.logradouro, 'pt-BR') || a.bairro.localeCompare(b.bairro, 'pt-BR'))
}

type Trecho = [number, number][] // [lat, lng]

function trechosDaGeometria(g: any): Trecho[] {
  const inverter = (l: [number, number][]) => l.map(([lng, lat]) => [lat, lng] as [number, number])
  if (g?.type === 'LineString') return [inverter(g.coordinates)]
  if (g?.type === 'MultiLineString') return g.coordinates.map(inverter)
  if (g?.type === 'Polygon') return [inverter(g.coordinates[0])]
  if (g?.type === 'MultiPolygon') return g.coordinates.map((p: any) => inverter(p[0]))
  return []
}

type LocalRua =
  | { tipo: 'ponto'; lat: number; lng: number; precisao: Precisao }
  | { tipo: 'rua'; trechos: Trecho[] }

async function localizarRua(r: RuaEncontrada, numero: string | null): Promise<LocalRua | null> {
  const enc = encodeURIComponent
  // Com numero: tenta a casa exata (nem toda casa de Teresina esta no mapa).
  if (numero) {
    const casa = await buscarNominatim(`q=${enc(`${r.logradouro}, ${numero}, ${r.bairro}, Teresina, PI`)}`)
    if (casa?.precisao === 'exata') return { tipo: 'ponto', ...casa }
  }

  // Rua inteira no bairro escolhido.
  const res = await fetch(
    `${NOMINATIM.replace('limit=1', 'limit=10')}&addressdetails=1&polygon_geojson=1&q=${enc(`${r.logradouro}, ${r.bairro}, Teresina, PI`)}`,
    { referrerPolicy: 'strict-origin-when-cross-origin' },
  ).catch(() => null)
  const lista: any[] = res?.ok ? await res.json().catch(() => []) : []
  const nome = nucleoRua(r.logradouro)
  const bairro = semAcento(r.bairro)
  const mesmaRua = (Array.isArray(lista) ? lista : []).filter(v => v.class === 'highway' && nucleoRua(v.address?.road || v.name || '') === nome)
  const bairroDe = (v: any) => [v.address?.suburb, v.address?.neighbourhood, v.address?.quarter, v.address?.city_district].filter(Boolean).map(semAcento)
  // Ruas com o mesmo nome em outro bairro ficam de fora; sem bairro no mapa, aceita.
  const doBairro = mesmaRua.filter(v => { const b = bairroDe(v); return b.length === 0 || !bairro || b.includes(bairro) })
  const trechos = doBairro.flatMap(v => trechosDaGeometria(v.geojson)).filter(t => t.length > 0)
  if (trechos.length) return { tipo: 'rua', trechos }

  // A rua nao esta no mapa aberto: centro do bairro.
  const centro = r.bairro && await buscarNominatim(`q=${enc(`${r.bairro}, Teresina, PI`)}`)
  return centro ? { tipo: 'ponto', ...centro, precisao: 'bairro' } : null
}

// Menor distancia (m) de um ponto ate a rua (todos os trechos).
function distanciaAteTrechos(lat: number, lng: number, trechos: Trecho[]) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540
  let menor = Infinity
  for (const t of trechos) {
    for (let i = 0; i < t.length; i++) {
      const [aLat, aLng] = t[i]
      const [bLat, bLng] = t[Math.min(i + 1, t.length - 1)]
      const ax = (aLng - lng) * kx, ay = (aLat - lat) * ky
      const bx = (bLng - lng) * kx, by = (bLat - lat) * ky
      const dx = bx - ax, dy = by - ay
      const comp = dx * dx + dy * dy
      const u = comp ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / comp)) : 0
      menor = Math.min(menor, Math.hypot(ax + u * dx, ay + u * dy))
    }
  }
  return menor
}

interface ResultadosBusca {
  ctos: any[]
  ruas: RuaEncontrada[]
  numero: string | null
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
  const [resultados, setResultados] = useState<ResultadosBusca | null>(null)
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
        crossOrigin: CROSS_ORIGIN_CARTO,
        maxZoom: 19,
        keepBuffer: 4, // mantem mais imagens em volta ao arrastar o mapa
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
            html: '<span style="display:block; width:11px; height:11px; background:' + cor + '; border:1.5px solid rgba(32,29,23,0.4); transform: rotate(45deg);"></span>',
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
  function classificarCaixas(distanciaDaCaixa: (lat: number, lng: number) => number) {
    const { marcadoresCtos } = camadasRef.current
    const candidatas: OpcaoCto[] = (marcadoresCtos || [])
      .map((m: any) => {
        const p = m.feature?.properties || {}
        return {
          nome: p.nome || 'CTO',
          distancia: distanciaDaCaixa(m._lat, m._lng),
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
    return { candidatas, nivel }
  }

  function avaliarPonto(lat: number, lng: number, rotulo: string, precisao: Precisao) {
    const { L, map } = camadasRef.current
    if (!L || !map) return
    const { candidatas, nivel } = classificarCaixas((cLat, cLng) => distanciaMetros(lat, lng, cLat, cLng))

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

  // Rua inteira: caixas com porta livre perto de qualquer trecho dela.
  function avaliarRua(trechos: Trecho[], rotulo: string) {
    const { L, map } = camadasRef.current
    if (!L || !map) return
    const { candidatas, nivel } = classificarCaixas((cLat, cLng) => distanciaAteTrechos(cLat, cLng, trechos))

    limparMarcaConsulta()
    const linha = L.polyline(trechos, { color: '#EA580C', weight: 6, opacity: 0.85, interactive: false })
    consultaCamadaRef.current = L.layerGroup([linha]).addTo(map)
    map.fitBounds(linha.getBounds(), { padding: [60, 60], maxZoom: 17 })

    consultaAtivaRef.current = true
    setConsulta({
      rotulo,
      precisao: 'trecho',
      nivel,
      opcoes: candidatas.filter(c => c.distancia <= RAIO_CONFIRMAR).slice(0, 3).map(({ nome, distancia, livres, ativa }) => ({ nome, distancia, livres, ativa })),
      distanciaMaisProxima: candidatas[0]?.distancia ?? null,
    })
  }

  async function escolherRua(r: RuaEncontrada, numero: string | null) {
    setResultados(null)
    setBuscando(true)
    const rotulo = `${r.logradouro}${numero ? `, ${numero}` : ''} - ${r.bairro || 'Teresina'}`
    try {
      const local = await localizarRua(r, numero)
      if (!local) {
        limparMarcaConsulta()
        consultaAtivaRef.current = true
        setConsulta({ rotulo, precisao: 'exata', nivel: 'nao_encontrado', opcoes: [], distanciaMaisProxima: null })
      } else if (local.tipo === 'rua') {
        avaliarRua(local.trechos, rotulo)
      } else {
        avaliarPonto(local.lat, local.lng, rotulo, local.precisao)
      }
    } catch (err) {
      console.error('Erro ao localizar a rua:', err)
    } finally {
      setBuscando(false)
    }
  }

  function escolherCto(marcador: any) {
    setResultados(null)
    const { grupoCtos } = camadasRef.current
    grupoCtos?.zoomToShowLayer(marcador, () => marcador.openPopup())
  }

  async function buscarEndereco() {
    if (!busca.trim()) return
    setResultados(null)
    setBuscando(true)
    try {
      const { marcadoresCtos } = camadasRef.current
      const buscaLower = busca.toLowerCase()
      const ehConsultaDireta = /^\s*\d{5}-?\d{3}\s*$/.test(busca) || extrairCoordenadas(busca) !== null

      // 1. Texto livre: caixas com esse nome/endereco + ruas de Teresina com
      // esse nome (por bairro). Um resultado so abre direto; varios viram lista.
      // CEP, coordenada e link do Maps vao direto para a consulta de viabilidade.
      if (!ehConsultaDireta) {
        const ctos = (marcadoresCtos || []).filter((m: any) => {
          const p = m.feature?.properties
          const texto = ((p?.nome || '') + ' ' + (p?.endereco || '')).toLowerCase()
          return texto.includes(buscaLower)
        }).slice(0, 5)
        const { rua, numero, bairro } = separarBusca(busca)
        const ruas = await buscarRuasViaCep(rua, bairro)

        if (ruas.length === 0 && ctos.length === 1) { escolherCto(ctos[0]); return }
        if (ctos.length === 0 && ruas.length === 1) { await escolherRua(ruas[0], numero); return }
        if (ruas.length + ctos.length > 0) {
          fecharConsulta()
          setResultados({ ctos, ruas: ruas.slice(0, 30), numero })
          return
        }
      }

      // 2. CEP, coordenada, link do Maps ou endereco sem rua nos Correios:
      // localiza e consulta a viabilidade
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
          <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-tema-superficie/95 backdrop-blur border border-tema-linha rounded-lg px-3 py-3 sm:py-1.5">
            <Search className="w-3.5 h-3.5 text-tema-apagado flex-shrink-0" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarEndereco()}
              placeholder="Buscar rua, CEP, CTO, coordenada ou link do Google Maps..."
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

        {/* Resultados da busca: ruas (por bairro) e caixas */}
        {resultados && (
          <div className="absolute top-16 sm:top-14 left-2 sm:left-3 z-[1001] w-[calc(100%-1rem)] sm:w-96 max-h-[60vh] flex flex-col bg-tema-superficie border border-tema-linha rounded-lg text-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-tema-linha">
              <span className="text-xs font-semibold text-tema-tinta">
                {resultados.ruas.length > 0 ? 'Escolha a rua e o bairro' : 'Escolha a caixa'}
                {resultados.numero && <span className="font-normal text-tema-apagado"> - numero {resultados.numero}</span>}
              </span>
              <button onClick={() => setResultados(null)} className="text-tema-apagado hover:text-tema-tinta" aria-label="Fechar resultados" title="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="overflow-y-auto divide-y divide-tema-linha">
              {resultados.ruas.map(r => (
                <li key={`${r.logradouro}|${r.bairro}`}>
                  <button onClick={() => escolherRua(r, resultados.numero)} className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-orange-500/10 focus:bg-orange-500/10 outline-none">
                    <MapPin className="w-3.5 h-3.5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-tema-tinta font-medium">{r.logradouro}</span>
                      <span className="block text-xs text-tema-suave">{r.bairro || 'Bairro nao informado'} <span className="font-mono text-tema-apagado">- {r.cep}</span></span>
                      {r.faixas.length > 0 && <span className="block text-[11px] text-tema-apagado truncate">{r.faixas.join(' | ')}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {resultados.ctos.map((m: any, i: number) => {
                const p = m.feature?.properties || {}
                return (
                  <li key={`cto-${i}`}>
                    <button onClick={() => escolherCto(m)} className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-orange-500/10 focus:bg-orange-500/10 outline-none">
                      <Box className="w-3.5 h-3.5 text-blue-700 mt-0.5 flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-tema-tinta font-medium">{p.nome || 'CTO'}</span>
                        {p.endereco && <span className="block text-xs text-tema-suave truncate">{p.endereco}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {resultados.ruas.length > 0 && (
              <p className="text-[11px] text-tema-apagado px-3 py-2 border-t border-tema-linha">
                Ruas de Teresina pelos Correios. Para um endereco exato, busque com o numero (ex.: Sao Jose, 123).
              </p>
            )}
          </div>
        )}

        {/* Consulta de viabilidade (prospeccao) */}
        {consulta && (
          <div className="absolute top-16 sm:top-14 left-2 sm:left-3 z-[1000] w-[calc(100%-1rem)] sm:w-80 bg-tema-superficie/95 backdrop-blur border border-tema-linha rounded-lg p-3 text-sm">
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
                Tente so o nome da rua (ex.: Sao Jose) ou clique no mapa no local desejado.
              </p>
            ) : (
              <>
                {consulta.precisao === 'trecho' ? (
                  <p className="text-xs text-tema-suave mt-1.5">
                    Rua inteira (em laranja no mapa): caixas perto de qualquer trecho dela. Para uma casa, clique no ponto no mapa ou busque com o numero.
                  </p>
                ) : consulta.precisao !== 'exata' && (
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
        <div className="absolute bottom-3 left-2 sm:left-3 z-[1000] bg-tema-superficie/95 backdrop-blur border border-tema-linha rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5 text-[10px] sm:text-xs text-tema-texto space-y-1 sm:space-y-1.5 max-w-[160px] sm:max-w-none">
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
          border-radius: 50%; background: #ff1744;
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
