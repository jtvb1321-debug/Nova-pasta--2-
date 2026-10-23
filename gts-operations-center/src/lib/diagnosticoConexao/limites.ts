import type { OltIxc } from './tipos'

// Limites de referencia do sinal optico. Arquivo puro (sem rede): usado no servidor e na tela.

/**
 * Limites de referencia do sinal de recepcao (RX da ONU). NAO ha um limite universal: este e' o padrao GPON classe B+ e
 * esta marcado como "nao confirmado" ate o usuario informar o limite de cada modelo de ONU/OLT.
 */
export interface LimitesRx { atencaoMin: number; atencaoMax: number; origem: string; confirmado: boolean }
const LIMITES_PADRAO: LimitesRx = { atencaoMin: -27, atencaoMax: -8, origem: 'Referência padrão GPON (classe B+); confirmar por modelo de ONU/OLT', confirmado: false }
/** Ponto de extensao: tabela por fabricante/modelo quando os limites reais forem informados. */
export function limitesRx(_olt: OltIxc | null, _modeloOnu: string | null): LimitesRx { return LIMITES_PADRAO }
