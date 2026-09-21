// Tokens do Dashboard NOC (Visao Geral) - tema claro. Mesmos valores
// hexadecimais ja usados em todo o resto do sistema (Sidebar, TopBar,
// gts-card, modais), mantidos aqui apenas porque graficos Recharts/SVG
// precisam de string de cor em JS, nao de classe Tailwind. O TVDashboard
// (Painel TV) tem seu proprio tema escuro intencional e NAO depende mais
// deste arquivo - ver src/lib/tempoDecorrido.ts para as funcoes compartilhadas.
export const NOC = {
  bg: '#FAF9F6', // bg-[#FAF9F6] - AppShell, paginas
  card: '#FFFFFF', // bg-white / .gts-card - Sidebar, TopBar, cards, modais
  sidebar: '#FFFFFF',
  azulPrimario: '#2563EB', // cor institucional primaria
  azulClaro: '#1D4ED8', // text-blue-700 - usado em icones e destaques
  laranja: '#EA580C', // text-orange-600 - usado no Sidebar, atalhos, institucional
  cinza: '#A69E8F', // textos terciarios, timestamps
  cinzaEscuro: '#E6E1D6', // border/grid de graficos
  texto: '#201D17',
  textoSecundario: '#7A7266', // texto secundario padrao do sistema
  sucesso: '#059669', // emerald-600 - online/sucesso em todo o sistema
  alerta: '#D97706', // amber-600 - atencao em todo o sistema
  critico: '#DC2626', // red-600 - critico em todo o sistema
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

export { formatarTempoDecorrido, formatarTempoRelativo } from '@/lib/tempoDecorrido'
