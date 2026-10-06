import { listarIXC } from './ixc'
import { formatarVelocidade } from './ixcFormato'
import { comCache, limparCache } from './inmapCache'

// Dados do cliente no IXC para a area do tecnico: plano/velocidade, login PPPoE,
// contrato e situacao da conexao. SOMENTE LEITURA.
//
// Tabelas do IXC usadas (campos conferidos na API):
//   radusuarios      login (PPPoE), id_grupo, id_contrato, ip, mac, online, ativo, ultima_conexao_inicial
//   radgrupos        grupo (nome do plano), download, upload ("310M")
//   cliente_contrato id_vd_contrato, status, status_internet, status_velocidade
//   vd_contratos     nome do plano de venda
//   cliente          razao, fantasia, telefones
//
// A senha do PPPoE (radusuarios.senha) e o CPF/CNPJ NUNCA saem daqui.

export interface PlanoIxc {
  grupo: string | null
  download: string | null   // velocidade configurada no plano (ex.: "310M")
  upload: string | null
}

export interface LoginIxc {
  login: string
  online: boolean
  ativo: boolean
  ip: string | null
  mac: string | null
  idContrato: string | null
  ultimaConexao: string | null
  plano: PlanoIxc | null
  tipoConexao: string | null     // como o IXC registra (ex.: "Ethernet")
  conexao: string | null         // porta/interface do concentrador (ex.: "eth 0/3/4096.153 ...")
  concentrador: string | null
  caixaFtth: string | null       // nome da caixa (ou "#id" se o nome nao puder ser lido)
  portaFtth: string | null
}

export interface ContratoIxc {
  id: string
  plano: string | null
  status: string | null          // rotulo (Ativo, Cancelado...)
  internet: string | null        // rotulo da situacao da internet (Ativa, Bloqueio automatico...)
  velocidade: string | null      // Normal / Reduzida
}

export interface DadosIxc {
  codigoIxc: string
  cliente: { nome: string | null; telefones: string[] }
  logins: LoginIxc[]
  contratos: ContratoIxc[]
  consultadoEm: string
}

const texto = (v: any): string | null => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s && s !== '0' && s.toLowerCase() !== 'null' ? s : null
}

// Rotulos dos codigos do IXC; codigo desconhecido aparece como esta, sem inventar significado.
const STATUS_CONTRATO: Record<string, string> = { P: 'Pré-contrato', A: 'Ativo', I: 'Inativo', N: 'Negativado', D: 'Desistiu' }
const STATUS_INTERNET: Record<string, string> = {
  A: 'Ativa', D: 'Desativada', CM: 'Bloqueio manual', CA: 'Bloqueio automático', FA: 'Financeiro em atraso', AA: 'Aguardando assinatura',
}
const STATUS_VELOCIDADE: Record<string, string> = { N: 'Normal', R: 'Reduzida' }

export function rotulo(mapa: Record<string, string>, codigo: any): string | null {
  const c = texto(codigo)
  return c ? (mapa[c.toUpperCase()] ?? c) : null
}

export { formatarVelocidade }

export function mapearPlano(reg: any): PlanoIxc | null {
  if (!reg) return null
  return { grupo: texto(reg.grupo), download: texto(reg.download), upload: texto(reg.upload) }
}

export function mapearLogin(reg: any, planos: Map<string, PlanoIxc | null>, caixas: Map<string, string | null> = new Map()): LoginIxc {
  const idCaixa = texto(reg.id_caixa_ftth)
  return {
    login: String(reg.login ?? ''),
    online: reg.online === 'S',
    ativo: reg.ativo === 'S',
    ip: texto(reg.ip),
    mac: texto(reg.mac),
    idContrato: texto(reg.id_contrato),
    ultimaConexao: texto(reg.ultima_conexao_inicial),
    plano: planos.get(String(reg.id_grupo)) ?? null,
    tipoConexao: texto(reg.tipo_conexao),
    conexao: texto(reg.conexao),
    concentrador: texto(reg.concentrador),
    caixaFtth: idCaixa ? (caixas.get(idCaixa) ?? `#${idCaixa}`) : null,
    portaFtth: texto(reg.ftth_porta),
  }
}

export function mapearContrato(reg: any, nomesPlano: Map<string, string>): ContratoIxc {
  return {
    id: String(reg.id),
    plano: nomesPlano.get(String(reg.id_vd_contrato)) ?? texto(reg.contrato),
    status: rotulo(STATUS_CONTRATO, reg.status),
    internet: rotulo(STATUS_INTERNET, reg.status_internet),
    velocidade: rotulo(STATUS_VELOCIDADE, reg.status_velocidade),
  }
}

// Nome da caixa FTTH: tabela rad_caixa_ftth, campo descricao (ex.: "RT 0/2/9 CX05").
// Se nao puder ser lido, a tela mostra "#id".
const TABELA_CAIXA_FTTH = 'rad_caixa_ftth'
const CAMPOS_NOME_CAIXA = ['descricao']

const um = (tabela: string, id: string) => listarIXC(tabela, { qtype: 'id', query: id, oper: '=', rp: 1 }).then(r => r[0] ?? null).catch(() => null)

async function buscarDadosIxc(codigoIxc: string): Promise<DadosIxc> {
  const [logins, contratos, clientes] = await Promise.all([
    listarIXC('radusuarios', { qtype: 'id_cliente', query: codigoIxc, oper: '=', rp: 20 }),
    listarIXC('cliente_contrato', { qtype: 'id_cliente', query: codigoIxc, oper: '=', rp: 20 }),
    listarIXC('cliente', { qtype: 'id', query: codigoIxc, oper: '=', rp: 1 }),
  ])

  const idsGrupo = [...new Set((logins as any[]).map(l => String(l.id_grupo)).filter(i => i && i !== '0'))]
  const idsPlano = [...new Set((contratos as any[]).map(c => String(c.id_vd_contrato)).filter(i => i && i !== '0'))]
  const [grupos, vds] = await Promise.all([
    Promise.all(idsGrupo.map(id => um('radgrupos', id))),
    Promise.all(idsPlano.map(id => um('vd_contratos', id))),
  ])

  // So os logins que vao aparecer (max. 5) precisam do nome da caixa.
  const idsCaixa = [...new Set((logins as any[]).map(l => texto(l.id_caixa_ftth)).filter((i): i is string => !!i))].slice(0, 5)
  const caixas = new Map<string, string | null>()
  await Promise.all(idsCaixa.map(async id => {
    const reg: any = await um(TABELA_CAIXA_FTTH, id)
    caixas.set(id, reg ? CAMPOS_NOME_CAIXA.map(c => texto(reg[c])).find(Boolean) ?? null : null)
  }))

  const planos = new Map<string, PlanoIxc | null>(idsGrupo.map((id, i) => [id, mapearPlano(grupos[i])]))
  const nomesPlano = new Map<string, string>()
  idsPlano.forEach((id, i) => { const n = texto(vds[i]?.nome); if (n) nomesPlano.set(id, n) })

  const cli: any = (clientes as any[])[0]
  const telefones = cli
    ? [...new Set([cli.telefone_celular, cli.fone, cli.telefone_comercial].map(texto).filter((t): t is string => !!t))]
    : []

  // Ativos primeiro; no maximo 5 de cada para a tela nao virar lista.
  const loginsMapeados = (logins as any[]).map(l => mapearLogin(l, planos, caixas)).sort((a, b) => Number(b.ativo) - Number(a.ativo)).slice(0, 5)
  const contratosMapeados = (contratos as any[]).map(c => mapearContrato(c, nomesPlano)).slice(0, 5)

  return {
    codigoIxc,
    cliente: { nome: texto(cli?.razao) ?? texto(cli?.fantasia), telefones },
    logins: loginsMapeados,
    contratos: contratosMapeados,
    consultadoEm: new Date().toISOString(),
  }
}

// Senhas do cliente (PPPoE, roteador, Wi-Fi), pedidas pelo usuario para a ficha do tecnico.
// Sem cache: cada consulta vai ao IXC e nada fica guardado no servidor. Quem chama confere a
// permissao, registra na auditoria e nunca pode gravar estes valores em log.
export interface CredenciaisIxc {
  login: string
  senhaPppoe: string | null
  senhaRouter1: string | null
  senhaRouter2: string | null
  senhaWifi: string | null
  senhaWifi5g: string | null
}

export function mapearCredenciais(reg: any): CredenciaisIxc {
  return {
    login: String(reg.login ?? ''),
    senhaPppoe: texto(reg.senha),
    senhaRouter1: texto(reg.senha_router1),
    senhaRouter2: texto(reg.senha_router2),
    senhaWifi: texto(reg.senha_rede_sem_fio),
    senhaWifi5g: texto(reg.senha_rede_sem_fio_5ghz),
  }
}

export async function credenciaisDoCliente(codigoIxc: string): Promise<CredenciaisIxc[]> {
  if (!/^\d+$/.test(codigoIxc)) throw new Error('codigo IXC invalido')
  const logins = await listarIXC('radusuarios', { qtype: 'id_cliente', query: codigoIxc, oper: '=', rp: 20 })
  return (logins as any[]).map(mapearCredenciais).filter(c => c.login).slice(0, 5)
}

const TTL_MS = 3 * 60 * 1000

export async function dadosIxcDoCliente(codigoIxc: string, forcar = false): Promise<DadosIxc> {
  if (!/^\d+$/.test(codigoIxc)) throw new Error('codigo IXC invalido')
  const chave = `ixc-cliente:${codigoIxc}`
  if (forcar) limparCache(chave)
  return comCache(chave, () => buscarDadosIxc(codigoIxc), TTL_MS)
}
