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
  | 'RETORNO_ESTOQUE' | 'DEVOLUCAO_FORNECEDOR' | 'DEFEITO'

export const STATUS_IU: Record<StatusIU, { rotulo: string; classe: string }> = {
  EM_ESTOQUE: { rotulo: 'Em estoque', classe: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
  COM_TECNICO: { rotulo: 'Com tecnico', classe: 'bg-blue-500/10 text-blue-700 border-blue-500/25' },
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
  SAIDA_TECNICO: { rotulo: 'Saida para tecnico', de: ['EM_ESTOQUE'], para: 'COM_TECNICO', exige: ['equipe'] },
  SAIDA_CLIENTE: { rotulo: 'Saida direta para cliente/chamado', de: ['EM_ESTOQUE'], para: 'INSTALADO', exige: ['cliente'] },
  INSTALACAO: { rotulo: 'Instalacao pelo tecnico (uso)', de: ['COM_TECNICO'], para: 'INSTALADO', exige: ['cliente'] },
  RETORNO_ESTOQUE: { rotulo: 'Retorno ao Estoque IU', de: ['COM_TECNICO', 'INSTALADO'], para: 'EM_ESTOQUE', exige: ['motivo'] },
  DEVOLUCAO_FORNECEDOR: { rotulo: 'Devolucao ao fornecedor', de: ['EM_ESTOQUE', 'DEFEITO'], para: 'DEVOLVIDO_FORNECEDOR', exige: ['motivo'] },
  DEFEITO: { rotulo: 'Defeito / descarte', de: ['EM_ESTOQUE', 'COM_TECNICO', 'INSTALADO'], para: 'DEFEITO', exige: ['motivo'] },
}

export const ROTULO_MOV_IU: Record<TipoMovIU, string> = {
  ENTRADA: 'Entrada',
  ...Object.fromEntries(Object.entries(MOVIMENTOS_IU).map(([k, v]) => [k, v.rotulo])),
} as Record<TipoMovIU, string>

// Serial/MAC bipado -> forma unica: sem espacos, maiusculo; MAC (12 hex, com
// ou sem separador) vira AA:BB:CC:DD:EE:FF, para o mesmo equipamento lido de
// etiquetas diferentes cair no mesmo registro.
export function normalizarSerial(bruto: string): string {
  const s = (bruto || '').trim().toUpperCase().replace(/\s+/g, '')
  const hex = s.replace(/[:\-.]/g, '')
  if (/^[0-9A-F]{12}$/.test(hex)) return hex.match(/.{2}/g)!.join(':')
  return s
}
