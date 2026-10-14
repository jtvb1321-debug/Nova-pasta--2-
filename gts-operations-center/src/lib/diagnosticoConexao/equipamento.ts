import { comCache } from '@/lib/inmapCache'
import { listarSinaisOnus, listarStatusOnus, paraDbm, type OnuSignal, type OnuStatus } from '@/lib/smartolt'
import type { Disponibilidade, EquipamentoOnu } from './tipos'

// Estado da ONU do cliente, lido do SmartOLT (SOMENTE LEITURA: nao reinicia nem altera nada).
// So casa a ONU por SERIAL EXATO (o do cadastro do login no IXC); nunca por nome/aproximacao, para nao mostrar
// o sinal de outro cliente. Sem casamento exato o indicador fica "Nao disponivel".

const alfanum = (s: unknown) => String(s ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()

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

export function montarEquipamento(serialIxc: string | null, status: OnuStatus[], sinais: OnuSignal[]): Disponibilidade<EquipamentoOnu> {
  const variantes = variantesDeSerial(serialIxc)
  if (!variantes.length) return { disponivel: false, motivo: 'O cadastro do login no IXC não informa o serial da ONU.' }
  const achadas = status.filter(o => variantes.includes(alfanum(o.sn)))
  if (achadas.length === 0) return { disponivel: false, motivo: 'O SmartOLT não encontrou uma ONU com o serial cadastrado no IXC.' }
  if (achadas.length > 1) return { disponivel: false, motivo: 'Mais de uma ONU no SmartOLT com o mesmo serial; não foi possível identificar a correta.' }
  const o = achadas[0]
  const sinal = sinais.find(x => x.unique_external_id === o.unique_external_id)
  return {
    disponivel: true,
    fonte: 'SmartOLT',
    status: o.status ?? null,
    sinalRxDbm: sinal ? paraDbm(sinal.signal_1310) : null,
    sinalTxDbm: sinal ? paraDbm(sinal.signal_1490) : null,
    ultimaMudancaStatus: o.last_status_change ?? null,
  }
}

/** Nunca derruba a consulta: SmartOLT fora do ar ou nao configurado vira "Nao disponivel". */
export async function lerEquipamento(serialIxc: string | null): Promise<Disponibilidade<EquipamentoOnu>> {
  if (!variantesDeSerial(serialIxc).length) return montarEquipamento(serialIxc, [], [])
  try {
    const [status, sinais] = await Promise.all([
      comCache('smartolt-status', listarStatusOnus, 5 * 60 * 1000),
      comCache('smartolt-sinais', listarSinaisOnus, 20 * 60 * 1000).catch(() => [] as OnuSignal[]),
    ])
    return montarEquipamento(serialIxc, status, sinais)
  } catch {
    return { disponivel: false, motivo: 'O SmartOLT não respondeu agora.' }
  }
}
