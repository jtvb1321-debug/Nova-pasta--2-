import { buscarCaixasFiberdocs } from './ixcFiberdocs'
import { listarIXC } from './ixc'
import { prisma } from './prisma'

// G W Telecomunicacoes Ltda (id_cliente 6643 no IXC) e uma revenda - os
// logins dela ficam registrados sob esse cliente guarda-chuva, mas nao sao
// clientes nossos. Nem eles nem as caixas exclusivas dela devem aparecer no mapa.
const ID_CLIENTE_EXCLUIDO = '6643'

const MIN_LOGINS_PARA_ALERTA = 3

// Login offline ha mais tempo que essa janela e tratado como inativo/abandonado
// (conta que nunca foi limpa) e nao entra na contagem de status da caixa -
// evita "Rota Offline" falso de clientes que cairam ha semanas/meses.
const JANELA_OFFLINE_DIAS = 7

function estaDentroDaJanelaOuOnline(login: any): boolean {
  if (login.online === 'S') return true
  const dataStr = login.ultima_conexao_final
  if (!dataStr || dataStr.startsWith('0000-00-00')) return false
  const data = new Date(dataStr.replace(' ', 'T'))
  if (isNaN(data.getTime())) return false
  const diasOffline = (Date.now() - data.getTime()) / (24 * 60 * 60 * 1000)
  return diasOffline <= JANELA_OFFLINE_DIAS
}

interface LoginCaixa {
  idCliente: string
  login: string
  online: boolean
}

export interface CaixaComStatus {
  id: string
  nome: string
  lat: number
  lng: number
  capacidade: number
  livres: number
  totalLogins: number
  ativos: number
  inativos: number
  emAlerta: boolean
  endereco: string | null
  projeto: string | null
  clientes: { nome: string; online: boolean }[]
}

async function buscarLoginsPorCaixa(): Promise<{ porCaixa: Map<string, LoginCaixa[]>; caixasApenasGW: Set<string> }> {
  const pagina1 = await listarIXC('radusuarios', { rp: 5000, page: 1 })
  const pagina2 = await listarIXC('radusuarios', { rp: 5000, page: 2 })
  const todosBruto = pagina1.concat(pagina2) as any[]

  // Caixa cujo unico login registrado e da G W (revenda) deve ser ocultada -
  // calculado ANTES de qualquer outro filtro, pra nao confundir com uma caixa
  // que so tem clientes nossos antigos/abandonados (essa continua aparecendo,
  // so nao entra no alerta).
  const caixasComLoginNaoGW = new Set<string>()
  const caixasComAlgumLogin = new Set<string>()
  for (const r of todosBruto) {
    const caixaId = r.id_caixa_ftth
    if (!caixaId || caixaId === '0') continue
    caixasComAlgumLogin.add(caixaId)
    if (r.id_cliente !== ID_CLIENTE_EXCLUIDO) caixasComLoginNaoGW.add(caixaId)
  }
  const caixasApenasGW = new Set(
    [...caixasComAlgumLogin].filter(id => !caixasComLoginNaoGW.has(id))
  )

  const todos = todosBruto.filter(r => r.id_cliente !== ID_CLIENTE_EXCLUIDO)

  const idsClientes: string[] = Array.from(new Set(
    todos.map((r: any) => r.id_cliente).filter((id: any): id is string => Boolean(id))
  ))
  const clientes = await prisma.cliente.findMany({
    where: { codigoIxc: { in: idsClientes } },
    select: { codigoIxc: true, nome: true },
  })
  const mapaNomes = new Map(clientes.map(c => [c.codigoIxc, c.nome]))

  const porCaixa = new Map<string, LoginCaixa[]>()
  for (const r of todos as any[]) {
    const caixaId = r.id_caixa_ftth
    if (!caixaId || caixaId === '0') continue

    // Login desativado (conta cancelada) ou sem cliente ativo correspondente
    // no nosso cadastro local (a sincronizacao so traz clientes ativos do IXC)
    // nao e mais nosso cliente - nao deve contar no monitoramento.
    if (r.ativo !== 'S') continue
    const nomeCliente = mapaNomes.get(r.id_cliente)
    if (!nomeCliente) continue

    // Cliente online ou offline ha no maximo 7 dias entra na contagem. Offline
    // ha mais tempo que isso (ou sem nenhum registro de conexao) e tratado
    // como inativo/abandonado e nao conta pro status da caixa.
    if (!estaDentroDaJanelaOuOnline(r)) continue

    const lista = porCaixa.get(caixaId) || []
    lista.push({
      idCliente: r.id_cliente,
      login: nomeCliente,
      online: r.online === 'S',
    })
    porCaixa.set(caixaId, lista)
  }

  return { porCaixa, caixasApenasGW }
}

// Fonte unica de verdade pro status das caixas - usada tanto pelo mapa de
// caixas quanto pela heuristica de cabo em alerta, pra nao divergir.
export async function buscarCaixasComStatusReal(): Promise<CaixaComStatus[]> {
  const [caixas, { porCaixa: loginsPorCaixa, caixasApenasGW }] = await Promise.all([
    buscarCaixasFiberdocs(),
    buscarLoginsPorCaixa(),
  ])

  const resultado: CaixaComStatus[] = []

  for (const c of caixas as any[]) {
    const coord = c.coordenadas?.[0]
    if (!coord) continue
    const lat = Number(coord[0])
    const lng = Number(coord[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const idClassico = String(c.id || '').match(/^\d+/)?.[0]

    // Caixa que so tem login registrado da G W (revenda excluida) - nao e nossa.
    if (idClassico && caixasApenasGW.has(idClassico)) continue

    const clientes = (idClassico && loginsPorCaixa.get(idClassico)) || []

    const capacidade = Number(c.capacidade || 0)
    const totalLogins = clientes.length
    const inativos = clientes.filter(cl => !cl.online).length
    const ativos = totalLogins - inativos
    const livres = Number(c.portas_disponiveis ?? Math.max(0, capacidade - totalLogins))
    const emAlerta = totalLogins >= MIN_LOGINS_PARA_ALERTA && inativos === totalLogins

    resultado.push({
      id: c.id,
      nome: c.nome || c.descricao || `Caixa ${c.id}`,
      lat, lng,
      capacidade,
      livres,
      totalLogins,
      ativos,
      inativos,
      emAlerta,
      endereco: c.endereco || null,
      projeto: c.nome_projeto || null,
      clientes: clientes.map(cl => ({ nome: cl.login, online: cl.online })),
    })
  }

  return resultado
}
