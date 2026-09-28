// Estoque IU: regras compartilhadas entre as telas e as rotas /api/estoque-iu.
// Estoque separado dos demais (tabelas iu_*), sem transferencia com outros
// estoques; so equipamentos com serial/MAC, entrada e saida bipadas.

export const PAPEIS_ESTOQUE_IU = ['ADMIN', 'GESTOR']

export function podeUsarEstoqueIU(role: string | undefined | null) {
  return !!role && PAPEIS_ESTOQUE_IU.includes(role)
}

export type StatusIU = 'EM_ESTOQUE' | 'COM_TECNICO' | 'INSTALADO' | 'DEVOLVIDO_FORNECEDOR' | 'DEFEITO'
export type TipoMovIU =
  | 'ENTRADA' | 'SAIDA_TECNICO' | 'SAIDA_CLIENTE' | 'INSTALACAO'
  | 'RETORNO_ESTOQUE' | 'REVERSA' | 'DEVOLUCAO_FORNECEDOR' | 'DEFEITO'

export const STATUS_IU: Record<StatusIU, { rotulo: string; classe: string }> = {
  EM_ESTOQUE: { rotulo: 'Em estoque', classe: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
  COM_TECNICO: { rotulo: 'Com tecnico (aguardando conferencia)', classe: 'bg-blue-500/10 text-blue-700 border-blue-500/25' },
  INSTALADO: { rotulo: 'Instalado', classe: 'bg-purple-500/10 text-purple-700 border-purple-500/25' },
  DEVOLVIDO_FORNECEDOR: { rotulo: 'Devolvido ao fornecedor', classe: 'bg-tema-contraste/[0.04] text-tema-suave border-tema-linha' },
  DEFEITO: { rotulo: 'Defeito / descarte', classe: 'bg-red-500/10 text-red-700 border-red-500/25' },
}

// Movimentos de saida/uso: de quais status a unidade pode partir, para qual
// status vai e o que e obrigatorio informar.
export const MOVIMENTOS_IU: Record<Exclude<TipoMovIU, 'ENTRADA'>, {
  rotulo: string
  de: StatusIU[]
  para: StatusIU
  exige: ('equipe' | 'cliente' | 'motivo')[]
}> = {
  SAIDA_TECNICO: { rotulo: 'Retirada pelo tecnico', de: ['EM_ESTOQUE'], para: 'COM_TECNICO', exige: ['equipe'] },
  SAIDA_CLIENTE: { rotulo: 'Saida direta para cliente/chamado', de: ['EM_ESTOQUE'], para: 'INSTALADO', exige: ['cliente'] },
  INSTALACAO: { rotulo: 'Conferencia: instalado no cliente', de: ['COM_TECNICO'], para: 'INSTALADO', exige: ['cliente'] },
  RETORNO_ESTOQUE: { rotulo: 'Conferencia: devolvido ao estoque', de: ['COM_TECNICO'], para: 'EM_ESTOQUE', exige: [] },
  REVERSA: { rotulo: 'Reversa (recolhido do cliente)', de: ['INSTALADO'], para: 'EM_ESTOQUE', exige: ['motivo'] },
  DEVOLUCAO_FORNECEDOR: { rotulo: 'Devolucao ao fornecedor', de: ['EM_ESTOQUE', 'DEFEITO'], para: 'DEVOLVIDO_FORNECEDOR', exige: ['motivo'] },
  DEFEITO: { rotulo: 'Defeito / descarte', de: ['EM_ESTOQUE', 'COM_TECNICO', 'INSTALADO'], para: 'DEFEITO', exige: ['motivo'] },
}

export const ROTULO_MOV_IU: Record<TipoMovIU, string> = {
  ENTRADA: 'Entrada',
  ...Object.fromEntries(Object.entries(MOVIMENTOS_IU).map(([k, v]) => [k, v.rotulo])),
} as Record<TipoMovIU, string>

// Fluxo: entrada -> estoque -> retirada (termo numerado) -> conferencia ->
// controle. Tudo que envolve unidade com tecnico passa pelo termo:
// retirada = SAIDA_TECNICO; conferencia = INSTALACAO, RETORNO_ESTOQUE ou DEFEITO.
export const PRAZO_CONFERENCIA_HORAS = 24

export const DESTINOS_CONFERENCIA = ['INSTALACAO', 'RETORNO_ESTOQUE', 'DEFEITO'] as const
export type DestinoConferencia = typeof DESTINOS_CONFERENCIA[number]
export const ROTULO_DESTINO: Record<DestinoConferencia, string> = {
  INSTALACAO: 'Instalado no cliente',
  RETORNO_ESTOQUE: 'Devolvido ao estoque',
  DEFEITO: 'Defeito',
}

// Movimentos avulsos (fora do termo): nao valem para unidade com tecnico.
export const TIPOS_AVULSOS = ['SAIDA_CLIENTE', 'REVERSA', 'DEVOLUCAO_FORNECEDOR', 'DEFEITO'] as const
export type TipoAvulso = typeof TIPOS_AVULSOS[number]

export function retiradaVencida(r: { status: string; createdAt: string | Date }) {
  return r.status === 'ABERTA' && Date.now() - new Date(r.createdAt).getTime() > PRAZO_CONFERENCIA_HORAS * 3600 * 1000
}

export const numeroTermo = (n: number) => String(n).padStart(4, '0')

// Grupos do relatorio do Estoque IU.
export const GRUPOS_RELATORIO_IU: { id: string; rotulo: string; tipos: TipoMovIU[]; classe: string }[] = [
  { id: 'entradas', rotulo: 'Entradas', tipos: ['ENTRADA'], classe: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/25' },
  { id: 'saidas', rotulo: 'Saidas', tipos: ['SAIDA_TECNICO', 'SAIDA_CLIENTE', 'INSTALACAO'], classe: 'text-blue-700 bg-blue-500/10 border-blue-500/25' },
  { id: 'devolucoes', rotulo: 'Devolucoes', tipos: ['RETORNO_ESTOQUE', 'DEVOLUCAO_FORNECEDOR'], classe: 'text-amber-700 bg-amber-500/10 border-amber-500/25' },
  { id: 'reversas', rotulo: 'Reversas', tipos: ['REVERSA'], classe: 'text-purple-700 bg-purple-500/10 border-purple-500/25' },
  { id: 'defeitos', rotulo: 'Defeito / descarte', tipos: ['DEFEITO'], classe: 'text-red-700 bg-red-500/10 border-red-500/25' },
]

// Serial/MAC bipado -> forma unica: sem espacos, maiusculo; MAC (12 hex, com
// ou sem separador) vira AA:BB:CC:DD:EE:FF, para o mesmo equipamento lido de
// etiquetas diferentes cair no mesmo registro.
export function normalizarSerial(bruto: string): string {
  const s = (bruto || '').trim().toUpperCase().replace(/\s+/g, '')
  const hex = s.replace(/[:\-.]/g, '')
  if (/^[0-9A-F]{12}$/.test(hex)) return hex.match(/.{2}/g)!.join(':')
  return s
}
