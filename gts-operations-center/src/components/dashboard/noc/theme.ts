// Tokens do Dashboard NOC (Visao Geral). Os neutros seguem o tema claro/escuro
// (variaveis --c-* de globals.css, as mesmas das classes tema-*); as cores de
// status sao fixas. Ficam aqui porque graficos Recharts/SVG precisam de string
// de cor em JS, nao de classe Tailwind. O TVDashboard (Painel TV) tem seu
// proprio tema escuro intencional e NAO depende deste arquivo - ver
// src/lib/tempoDecorrido.ts para as funcoes compartilhadas.
export const NOC = {
  bg: 'rgb(var(--c-fundo))', // bg-tema-fundo - AppShell, paginas
  card: 'rgb(var(--c-superficie))', // bg-tema-superficie / .gts-card - Sidebar, TopBar, cards, modais
  sidebar: 'rgb(var(--c-superficie))',
  azulPrimario: '#2563EB', // cor institucional primaria
  azulClaro: '#1D4ED8', // text-blue-700 - usado em icones e destaques
  laranja: '#EA580C', // text-orange-600 - usado no Sidebar, atalhos, institucional
  cinza: 'rgb(var(--c-apagado))', // textos terciarios, timestamps
  cinzaEscuro: 'rgb(var(--c-linha))', // border/grid de graficos
  texto: 'rgb(var(--c-tinta))',
  textoSecundario: 'rgb(var(--c-suave))', // texto secundario padrao do sistema
  sucesso: '#059669', // emerald-600 - online/sucesso em todo o sistema
  alerta: '#D97706', // amber-600 - atencao em todo o sistema
  critico: '#DC2626', // red-600 - critico em todo o sistema
} as const

// Fundo translucido dos cartoes (antes `${NOC.card}CC`, que so funcionava com hex).
export const CARD_TRANSLUCIDO = 'rgb(var(--c-superficie) / 0.8)'

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
