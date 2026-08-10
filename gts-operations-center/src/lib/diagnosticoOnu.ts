import { listarStatusOnus, listarSinaisOnus, paraDbm, type OnuStatus, type OnuSignal } from './smartolt'
import { normalizar } from './linkDedicado'

export interface InfoOnuDiagnostico {
  encontrada: boolean
  idOnuSmartOlt: string | null
  nome: string | null
  status: string | null
  sinalRxDbm: number | null
  sinalTxDbm: number | null
  ultimaMudancaStatus: string | null
}

// Casa a ONU do cliente por unique_external_id ja gravado no chamado
// (Chamado.idOnuSmartOlt, campo existente mas nunca usado antes deste
// modulo) ou, se ainda nao houver vinculo, tenta achar por aproximacao do
// nome do cliente - mesma logica de "melhor esforco" do linkDedicado.ts,
// ja que hoje nao ha id em comum confiavel entre o cadastro de clientes e
// o SmartOLT.
export async function buscarOnuParaDiagnostico(
  idOnuSmartOlt: string | null | undefined,
  nomeCliente: string
): Promise<InfoOnuDiagnostico> {
  const vazio: InfoOnuDiagnostico = {
    encontrada: false,
    idOnuSmartOlt: null,
    nome: null,
    status: null,
    sinalRxDbm: null,
    sinalTxDbm: null,
    ultimaMudancaStatus: null,
  }

  try {
    const [statuses, sinais] = await Promise.all([listarStatusOnus(), listarSinaisOnus()])

    let statusOnu: OnuStatus | undefined
    let sinalOnu: OnuSignal | undefined

    if (idOnuSmartOlt) {
      statusOnu = statuses.find(s => s.unique_external_id === idOnuSmartOlt)
      sinalOnu = sinais.find(s => s.unique_external_id === idOnuSmartOlt)
    }

    if (!statusOnu) {
      const nomeNorm = normalizar(nomeCliente || '')
      if (nomeNorm.length > 3) {
        statusOnu = statuses.find(s => {
          const n = normalizar(s.name || '')
          return n && (n === nomeNorm || n.includes(nomeNorm) || nomeNorm.includes(n))
        })
        if (statusOnu) {
          sinalOnu = sinais.find(s => s.unique_external_id === statusOnu!.unique_external_id)
        }
      }
    }

    if (!statusOnu) return vazio

    return {
      encontrada: true,
      idOnuSmartOlt: statusOnu.unique_external_id,
      nome: statusOnu.name,
      status: statusOnu.status,
      sinalRxDbm: sinalOnu ? paraDbm(sinalOnu.signal_1310) : null,
      sinalTxDbm: sinalOnu ? paraDbm(sinalOnu.signal_1490) : null,
      ultimaMudancaStatus: statusOnu.last_status_change,
    }
  } catch {
    // SmartOLT indisponivel ou nao configurado - nao trava o diagnostico,
    // so reporta como nao encontrada.
    return vazio
  }
}
