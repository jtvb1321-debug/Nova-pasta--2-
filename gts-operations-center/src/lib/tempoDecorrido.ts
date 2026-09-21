// Formatacao de duracao/tempo relativo - usada tanto pelo Dashboard (Visao
// Geral, tema claro) quanto pelo TVDashboard (Painel TV, tema escuro
// intencional). Extraido de dashboard/noc/theme.ts para que nenhum dos dois
// dependa da paleta de cores um do outro.
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
