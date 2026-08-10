import { listarIXC } from './ixc'
import { prisma } from './prisma'
import { listarSinaisOnus, paraDbm } from './smartolt'

// Grupos (radgrupos) do IXC identificados como Link Dedicado / IP Dedicado /
// Corporativo. Descoberto por inspecao manual - se surgir um plano novo desse
// tipo, adicione o id do grupo aqui.
const GRUPOS_DEDICADOS: Record<string, string> = {
  '88': 'LINK_DEDICADO_250MB',
  '86': 'Link_Dedicado_100_Megas',
  '81': 'PLANO_120MBPS_IP_DEDICADO',
  '57': 'LINK_DEDICADO_PORTA_1GB',
  '83': 'PLANO_LINK_IP_200MBPS',
  '80': 'PLANO_10MB_FULL_CORPORATIVO',
  '46': 'PLANO_50MBPS_CORPORATIVO',
}

export interface ClienteLinkDedicado {
  codigoIxc: string
  nome: string
  idContrato: string | null
  plano: string
  ip: string | null
  potenciaRx: number | null
  potenciaTx: number | null
  fonteIp: 'ixc' | 'manual' | null
  fontePotencia: 'smartolt' | 'manual' | null
  ativo: boolean
  online: boolean
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export async function buscarClientesLinkDedicado(): Promise<ClienteLinkDedicado[]> {
  const idsGrupo = Object.keys(GRUPOS_DEDICADOS)

  const listasPorGrupo = await Promise.all(
    idsGrupo.map(idGrupo => listarIXC('radusuarios', { qtype: 'id_grupo', query: idGrupo, oper: '=', rp: 500 }))
  )
  const logins = listasPorGrupo.flat() as any[]

  const idsClientes = [...new Set(logins.map(l => l.id_cliente).filter(Boolean))] as string[]
  const [clientesLocais, overrides, sinaisOnu] = await Promise.all([
    prisma.cliente.findMany({ where: { codigoIxc: { in: idsClientes } }, select: { codigoIxc: true, nome: true } }),
    prisma.monitoramentoLinkDedicado.findMany({ where: { codigoIxc: { in: idsClientes } } }),
    listarSinaisOnus().catch(() => []),
  ])

  const mapaNomes = new Map(clientesLocais.map(c => [c.codigoIxc, c.nome]))
  const mapaOverrides = new Map(overrides.map(o => [o.codigoIxc, o]))

  // Tenta casar o sinal da ONU pelo nome cadastrado no SmartOLT com o
  // login/nome do cliente - e uma aproximacao (nao ha id em comum confiavel
  // entre IXC e SmartOLT hoje), por isso e so "melhor esforco".
  const sinaisNormalizados = sinaisOnu.map((s: any) => ({ ...s, nomeNormalizado: normalizar(s.name || '') }))

  function buscarSinal(login: string, nomeCliente: string) {
    const loginNorm = normalizar(login)
    const nomeNorm = normalizar(nomeCliente)
    return sinaisNormalizados.find((s: any) =>
      s.nomeNormalizado && (
        s.nomeNormalizado === loginNorm ||
        s.nomeNormalizado === nomeNorm ||
        (loginNorm.length > 3 && s.nomeNormalizado.includes(loginNorm)) ||
        (nomeNorm.length > 3 && s.nomeNormalizado.includes(nomeNorm))
      )
    )
  }

  const resultado: ClienteLinkDedicado[] = logins.map((l: any) => {
    const nomeCliente = mapaNomes.get(l.id_cliente) || l.login || `Cliente ${l.id_cliente}`
    const override = mapaOverrides.get(l.id_cliente)
    const sinal = buscarSinal(l.login, nomeCliente)

    const ipIxc = l.ip || l.ip_aviso || null
    const ip = ipIxc || override?.ipManual || null
    const potenciaRx = sinal ? paraDbm(sinal.signal_1310) : (override?.potenciaRxManual ?? null)
    const potenciaTx = sinal ? paraDbm(sinal.signal_1490) : (override?.potenciaTxManual ?? null)

    return {
      codigoIxc: l.id_cliente,
      nome: nomeCliente,
      idContrato: l.id_contrato && l.id_contrato !== '0' ? l.id_contrato : null,
      plano: GRUPOS_DEDICADOS[l.id_grupo] || l.id_grupo,
      ip,
      potenciaRx,
      potenciaTx,
      fonteIp: ipIxc ? 'ixc' : (override?.ipManual ? 'manual' : null),
      fontePotencia: sinal ? 'smartolt' : (override?.potenciaRxManual != null ? 'manual' : null),
      ativo: l.ativo === 'S',
      online: l.online === 'S',
    }
  })

  return resultado
}
