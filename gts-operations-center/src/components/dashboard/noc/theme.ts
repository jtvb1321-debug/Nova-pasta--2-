// Tokens do Dashboard NOC (Visao Geral) - NAO sao uma paleta nova: sao os
// mesmos valores hexadecimais ja usados em todo o resto do sistema (Sidebar,
// TopBar, gts-card, modais, TVDashboard). Mantidos aqui apenas porque graficos
// Recharts/SVG precisam de string de cor em JS, nao de classe Tailwind.
export const NOC = {
  bg: '#0B1120', // bg-[#0B1120] - AppShell, paginas, TVDashboard
  card: '#111827', // bg-[#111827] / .gts-card - Sidebar, TopBar, cards, modais
  sidebar: '#111827',
  azulPrimario: '#2563EB', // gts.blue / bg-gts-blue - cor institucional primaria
  azulClaro: '#60A5FA', // text-blue-400 - usado em icones e destaques
  laranja: '#FB923C', // text-orange-400 - usado no Sidebar, atalhos, institucional
  cinza: '#6B7280', // gts.gray / text-gray-500 - textos terciarios, timestamps
  cinzaEscuro: '#374151', // border/grid de graficos (equivalente a border-white/10 solido)
  texto: '#FFFFFF',
  textoSecundario: '#9CA3AF', // text-gray-400 - texto secundario padrao do sistema
  sucesso: '#34D399', // text-emerald-400 - online/sucesso em todo o sistema
  alerta: '#FACC15', // text-yellow-400 - atencao em todo o sistema
  critico: '#F87171', // text-red-400 - critico em todo o sistema
} as const

export function corNivel(nivel: string): string {
  switch (nivel.toLowerCase()) {
    case 'critico':
    case 'critica':
    case 'alta':
      return NOC.critico
    case 'alerta':
    case 'atencao':
    case 'alto':
    case 'media':
      return NOC.alerta
    case 'sucesso':
    case 'otimo':
      return NOC.sucesso
    default:
      return NOC.azulClaro
  }
}

export function formatarTempoDecorrido(minutos: number): string {
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  const min = minutos % 60
  if (horas < 24) return `${horas}h${min > 0 ? ` ${min}min` : ''}`
  const dias = Math.floor(horas / 24)
  return `${dias}d ${horas % 24}h`
}

export function formatarTempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atras`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atras`
  const d = Math.floor(h / 24)
  return `${d}d atras`
}
