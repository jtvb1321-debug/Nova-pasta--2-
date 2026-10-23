import { listarIXC } from '@/lib/ixc'
import { comCache } from '@/lib/inmapCache'
import { listarSinaisOnus, listarStatusOnus, paraDbm, type OnuSignal, type OnuStatus } from '@/lib/smartolt'
import { dataHoraIxc } from './formato'
import type { Disponibilidade, EquipamentoOnu } from './tipos'

// Equipamento (ONU) do cliente, SOMENTE LEITURA.
//  1) aba "Fibra" do cadastro do login no IXC (tabela radpop_radio_cliente_fibra): sinal RX/TX, temperatura, tensao, modelo, MAC;
//  2) opcional: status da ONU no SmartOLT, so quando o serial casa EXATAMENTE (nunca por nome/aproximacao).
// Sinal "0" ou vazio no IXC e' "sem leitura" (ONU desligada ou nao consultada), nunca 0 dBm.

/** Faixa usual de recepcao de uma ONU GPON (referencia comum, Classe B+). Fora dela mostramos um aviso, sem concluir mais nada. */
export const FAIXA_RX_DBM = { min: -27, max: -8 } as const
export const foraDaFaixaRx = (rx: number | null) => rx != null && (rx < FAIXA_RX_DBM.min || rx > FAIXA_RX_DBM.max)

const alfanum = (s: unknown) => String(s ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
const texto = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s && s.toLowerCase() !== 'null' ? s : null
}
/** Numero de leitura: vazio, invalido ou 0 viram null (0 dBm/0 V/0 C = sem leitura). */
export function leitura(v: unknown): number | null {
  const s = texto(v)
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && n !== 0 ? n : null
}

export interface FibraIxc {
  modelo: string | null
  mac: string | null
  sinalRxDbm: number | null
  sinalTxDbm: number | null
  temperaturaC: number | null
  voltagemV: number | null
  leituraEm: string | null
  causaUltimaQueda: string | null
  distanciaM: number | null
}

export function mapearFibra(reg: any): FibraIxc | null {
  if (!reg) return null
  return {
    modelo: texto(reg.onu_tipo),
    mac: texto(reg.mac),
    sinalRxDbm: leitura(reg.sinal_rx),
    sinalTxDbm: leitura(reg.sinal_tx),
    temperaturaC: leitura(reg.temperatura),
    voltagemV: leitura(reg.voltagem),
    leituraEm: dataHoraIxc(reg.data_sinal),
    causaUltimaQueda: texto(reg.causa_ultima_queda),
    distanciaM: leitura(reg.distancia_onu),
  }
}

/**
 * Formas equivalentes de escrever o mesmo serial GPON: "HWTC1234ABCD" e "485754431234ABCD" (4 primeiros caracteres
 * em ASCII x hexadecimal). Devolve todas as grafias a comparar.
 */
export function variantesDeSerial(bruto: unknown): string[] {
  const s = alfanum(bruto)
  if (s.length < 8) return []
  const out = new Set<string>([s])
  if (/^[0-9A-F]{16}$/.test(s)) {
    const ascii = s.slice(0, 8).match(/../g)!.map(h => String.fromCharCode(parseInt(h, 16))).join('')
    if (/^[A-Z0-9]{4}$/.test(ascii)) out.add(ascii + s.slice(8))
  } else if (/^[A-Z0-9]{4}[0-9A-F]{8}$/.test(s)) {
    out.add([...s.slice(0, 4)].map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('') + s.slice(4))
  }
  return [...out]
}

export interface OnuSmartOlt { status: string | null; ultimaMudancaStatus: string | null; rxDbm: number | null; txDbm: number | null }

/** ONU do SmartOLT com o MESMO serial (exato). Zero, mais de uma ou serial ausente: null. */
export function casarOnuSmartOlt(serialIxc: string | null, status: OnuStatus[], sinais: OnuSignal[]): OnuSmartOlt | null {
  const variantes = variantesDeSerial(serialIxc)
  if (!variantes.length) return null
  const achadas = status.filter(o => variantes.includes(alfanum(o.sn)))
  if (achadas.length !== 1) return null
  const o = achadas[0]
  const sinal = sinais.find(x => x.unique_external_id === o.unique_external_id)
  return { status: o.status ?? null, ultimaMudancaStatus: o.last_status_change ?? null, rxDbm: sinal ? paraDbm(sinal.signal_1310) : null, txDbm: sinal ? paraDbm(sinal.signal_1490) : null }
}

export function montarEquipamento(fibra: FibraIxc | null, olt: OnuSmartOlt | null): Disponibilidade<EquipamentoOnu> {
  if (!fibra && !olt) return { disponivel: false, motivo: 'O IXC não tem registro da ONU (aba Fibra) para este login.' }
  const f: FibraIxc = fibra ?? { modelo: null, mac: null, sinalRxDbm: null, sinalTxDbm: null, temperaturaC: null, voltagemV: null, leituraEm: null, causaUltimaQueda: null, distanciaM: null }
  return {
    disponivel: true,
    fonte: fibra ? (olt ? 'IXC (aba Fibra) e SmartOLT' : 'IXC (aba Fibra)') : 'SmartOLT',
    modelo: f.modelo, mac: f.mac,
    // O sinal do IXC e' o preferido; o do SmartOLT so completa quando o IXC nao tem leitura.
    sinalRxDbm: f.sinalRxDbm ?? olt?.rxDbm ?? null,
    sinalTxDbm: f.sinalTxDbm ?? olt?.txDbm ?? null,
    temperaturaC: f.temperaturaC, voltagemV: f.voltagemV, leituraEm: f.leituraEm,
    causaUltimaQueda: f.causaUltimaQueda, distanciaM: f.distanciaM,
    statusOlt: olt?.status ?? null, ultimaMudancaStatus: olt?.ultimaMudancaStatus ?? null,
  }
}

async function lerFibra(idLogin: string | null): Promise<FibraIxc | null> {
  if (!idLogin || !/^\d+$/.test(idLogin)) return null
  try {
    const r: any[] = await listarIXC('radpop_radio_cliente_fibra', { qtype: 'id_login', query: idLogin, oper: '=', rp: 1 })
    return mapearFibra(r[0])
  } catch { return null }
}

async function lerSmartOlt(serial: string | null): Promise<OnuSmartOlt | null> {
  if (!variantesDeSerial(serial).length) return null
  try {
    const [status, sinais] = await Promise.all([
      comCache('smartolt-status', listarStatusOnus, 5 * 60 * 1000),
      comCache('smartolt-sinais', listarSinaisOnus, 20 * 60 * 1000).catch(() => [] as OnuSignal[]),
    ])
    return casarOnuSmartOlt(serial, status, sinais)
  } catch { return null }
}

/** A partir do registro da aba Fibra ja lido (evita consultar o IXC duas vezes). */
export async function equipamentoDeRegistro(reg: any | null, serialIxc: string | null): Promise<Disponibilidade<EquipamentoOnu>> {
  const fibra = mapearFibra(reg)
  const olt = await lerSmartOlt(fibra?.mac ?? serialIxc)
  return montarEquipamento(fibra, olt)
}

/** Nunca derruba a consulta: o que nao vier fica "Nao disponivel". */
export async function lerEquipamento(idLogin: string | null, serialIxc: string | null): Promise<Disponibilidade<EquipamentoOnu>> {
  const fibra = await lerFibra(idLogin)
  const olt = await lerSmartOlt(fibra?.mac ?? serialIxc)
  return montarEquipamento(fibra, olt)
}
