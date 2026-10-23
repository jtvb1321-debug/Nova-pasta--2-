import { listarIXC } from '@/lib/ixc'
import { dadosIxcDoCliente, type DadosIxc, type LoginIxc } from '@/lib/ixcCliente'
import { dataHoraIxc, dataIso, diaIxc, octetos, paraMbps } from './formato'
import { equipamentoDeRegistro } from './equipamento'
import { gerarHipoteses } from './hipoteses'
import { lerFibraRegistro, lerRede } from './rede'
import {
  ErroDiagnostico, INDICADORES_NAO_MEDIDOS,
  type ConsumoDia, type ConsumoPeriodo, type ContratoConexao, type Disponibilidade, type DiagnosticoConexao, type EquipamentoOnu,
  type PeriodoConsulta, type RespostaConsulta, type ResultadoBusca, type SessaoAtual, type SessaoConexao, type SessoesPeriodo,
} from './tipos'

// Servico de Diagnostico de Conexao. SOMENTE LEITURA, SOMENTE IXC.
//
// O que ja estava comprovado na integracao existente (lib/ixcCliente.ts): cliente, cliente_contrato,
// vd_contratos, radusuarios (login, contrato, online, ip, mac, ultima conexao) e radgrupos (velocidade do plano).
// O que este servico acrescenta e que DEPENDE do IXC do provedor expor: a tabela radacct (sessoes PPPoE com
// volume de entrada/saida). Se ela nao responder ou vier sem os campos, o consumo vira "Não disponível pelo IXC".
// Senha, CPF/CNPJ e credenciais nunca passam por aqui.

export const FONTE_ATIVA = 'ixc' as const
const MAX_PAGINAS_SESSOES = 6
const POR_PAGINA = 500
export const MAX_DIAS_PERIODO = 90

const texto = (v: any): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s && s !== '0' && s.toLowerCase() !== 'null' ? s : null
}

function mapearErroIxc(e: unknown): ErroDiagnostico {
  if (e instanceof ErroDiagnostico) return e
  const msg = String((e as Error)?.message ?? '')
  if (/nao configurados/i.test(msg)) return new ErroDiagnostico('IXC_NAO_CONFIGURADO', 'A integração com o IXC não está configurada neste ambiente.')
  return new ErroDiagnostico('IXC_INDISPONIVEL', 'Não consegui consultar o IXC agora. Tente de novo em instantes.')
}

// ------------------------------------------------------------------ periodo
export function resolverPeriodo(p: { periodo?: string; dataInicio?: string; dataFim?: string }, agora = new Date()): PeriodoConsulta {
  const DIA = 86_400_000
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  let inicio: Date
  let fim = hoje
  let rotulo: string
  if (p.dataInicio || p.dataFim) {
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (!p.dataInicio || !p.dataFim || !re.test(p.dataInicio) || !re.test(p.dataFim)) throw new ErroDiagnostico('INVALIDO', 'Informe a data inicial e a final (AAAA-MM-DD).')
    const [a, m, d] = p.dataInicio.split('-').map(Number)
    const [a2, m2, d2] = p.dataFim.split('-').map(Number)
    inicio = new Date(a, m - 1, d)
    fim = new Date(a2, m2 - 1, d2)
    if (inicio.getMonth() !== m - 1 || fim.getMonth() !== m2 - 1) throw new ErroDiagnostico('INVALIDO', 'Data inválida.')
    if (fim < inicio) throw new ErroDiagnostico('INVALIDO', 'A data final não pode ser anterior à inicial.')
    if (fim > hoje) fim = hoje
    rotulo = 'período personalizado'
  } else if (p.periodo === '7d') {
    inicio = new Date(hoje.getTime() - 6 * DIA); rotulo = 'últimos 7 dias'
  } else {
    inicio = new Date(hoje.getTime() - 29 * DIA); rotulo = 'últimos 30 dias'
  }
  const dias = Math.round((fim.getTime() - inicio.getTime()) / DIA) + 1
  if (dias > MAX_DIAS_PERIODO) throw new ErroDiagnostico('INVALIDO', `O período máximo é de ${MAX_DIAS_PERIODO} dias.`)
  return { inicio: dataIso(inicio), fim: dataIso(fim), rotulo, dias }
}

// ------------------------------------------------------------------ busca
export function limparTermo(bruto: string): string {
  return String(bruto ?? '').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

const um = (tabela: string, qtype: string, valor: string) => listarIXC(tabela, { qtype, query: valor, oper: '=', rp: 1 }).then(r => r[0] ?? null)
const nomeCliente = (c: any): string | null => texto(c?.razao) ?? texto(c?.fantasia)

/** Procura por nome, codigo do cliente, numero do contrato ou login. Devolve no maximo 15 clientes. */
export async function buscarClientes(termoBruto: string): Promise<ResultadoBusca[]> {
  const termo = limparTermo(termoBruto)
  const soDigitos = /^\d+$/.test(termo)
  if (!soDigitos && termo.length < 3) throw new ErroDiagnostico('INVALIDO', 'Digite pelo menos 3 letras do nome, o código do cliente, o contrato ou o login.')
  if (!termo) throw new ErroDiagnostico('INVALIDO', 'Digite o que deseja buscar.')

  const achados = new Map<string, ResultadoBusca>()
  const nomes = new Map<string, string | null>()
  const resolverNome = async (codigo: string) => {
    if (!nomes.has(codigo)) nomes.set(codigo, nomeCliente(await um('cliente', 'id', codigo).catch(() => null)))
    return nomes.get(codigo) ?? null
  }
  const adicionar = async (codigo: string, origem: ResultadoBusca['origem'], nomeJaConhecido?: string | null) => {
    if (!/^\d+$/.test(codigo) || achados.has(codigo) || achados.size >= 15) return
    const nome = nomeJaConhecido ?? (await resolverNome(codigo))
    achados.set(codigo, { codigo, nome: nome ?? `Cliente ${codigo}`, origem })
  }

  const tarefas: Promise<void>[] = []
  if (soDigitos) {
    tarefas.push(um('cliente', 'id', termo).then(c => (c ? adicionar(String(c.id), 'codigo', nomeCliente(c)) : undefined)))
    tarefas.push(um('cliente_contrato', 'id', termo).then(c => (c ? adicionar(String(c.id_cliente), 'contrato') : undefined)))
  } else {
    tarefas.push(listarIXC('cliente', { qtype: 'razao', query: termo, oper: 'L', rp: 15 }).then(async rs => { for (const c of rs) await adicionar(String(c.id), 'nome', nomeCliente(c)) }))
    tarefas.push(listarIXC('cliente', { qtype: 'fantasia', query: termo, oper: 'L', rp: 10 }).then(async rs => { for (const c of rs) await adicionar(String(c.id), 'nome', nomeCliente(c)) }))
  }
  if (!soDigitos && /^[\w.@-]{3,}$/.test(termo)) {
    tarefas.push(listarIXC('radusuarios', { qtype: 'login', query: termo, oper: 'L', rp: 10 }).then(async rs => { for (const l of rs) await adicionar(String(l.id_cliente), 'login') }))
  }
  const resultados = await Promise.allSettled(tarefas)
  if (resultados.length > 0 && resultados.every(r => r.status === 'rejected')) throw mapearErroIxc((resultados[0] as PromiseRejectedResult).reason)
  return [...achados.values()].slice(0, 15)
}

// ------------------------------------------------------------------ contratos
export function contratosDe(dados: DadosIxc): ContratoConexao[] {
  return dados.contratos.map(c => ({
    id: c.id, plano: c.plano, status: c.status, internet: c.internet, velocidadeStatus: c.velocidade,
    logins: dados.logins.filter(l => l.idContrato === c.id).map(l => ({ login: l.login, online: l.online, ativo: l.ativo })),
  }))
}

export async function contratosDoCliente(codigo: string): Promise<{ cliente: { codigo: string; nome: string | null }; contratos: ContratoConexao[] }> {
  if (!/^\d+$/.test(codigo)) throw new ErroDiagnostico('INVALIDO', 'Código de cliente inválido.')
  try {
    const dados = await dadosIxcDoCliente(codigo)
    if (!dados.cliente.nome && dados.contratos.length === 0 && dados.logins.length === 0) throw new ErroDiagnostico('NAO_ENCONTRADO', 'Cliente não encontrado no IXC.')
    return { cliente: { codigo, nome: dados.cliente.nome }, contratos: contratosDe(dados) }
  } catch (e) {
    throw mapearErroIxc(e)
  }
}

// ------------------------------------------------------------------ sessoes e consumo (radacct)
export interface RegistroSessao { [campo: string]: any }

export function mapearSessao(r: RegistroSessao): SessaoConexao {
  const fimBruto = dataHoraIxc(r.acctstoptime)
  const dur = Number(String(r.acctsessiontime ?? '').trim())
  return {
    inicio: dataHoraIxc(r.acctstarttime),
    fim: fimBruto,
    duracaoSegundos: Number.isFinite(dur) && dur > 0 ? dur : null,
    ip: texto(r.framedipaddress),
    downloadBytes: octetos(r.acctoutputoctets, r.acctoutputgigawords),
    uploadBytes: octetos(r.acctinputoctets, r.acctinputgigawords),
    motivoDesconexao: fimBruto ? texto(r.acctterminatecause) : null,
  }
}

/** Agrega as sessoes do periodo. Funcao pura (testada sem rede). */
export function agregarSessoes(registros: RegistroSessao[], periodo: PeriodoConsulta, truncado: boolean): { consumo: Disponibilidade<ConsumoPeriodo>; sessoes: Disponibilidade<SessoesPeriodo> } {
  const doPeriodo = registros.filter(r => {
    const dia = diaIxc(r.acctstarttime)
    return !!dia && dia >= periodo.inicio && dia <= periodo.fim
  })
  if (doPeriodo.length === 0) {
    const motivo = 'Nenhuma sessão registrada no IXC para este login no período.'
    return { consumo: { disponivel: false, motivo }, sessoes: { disponivel: false, motivo } }
  }

  const sessoesMapeadas = doPeriodo.map(mapearSessao)
  const motivos = new Map<string, number>()
  for (const s of sessoesMapeadas) if (s.fim && s.motivoDesconexao) motivos.set(s.motivoDesconexao, (motivos.get(s.motivoDesconexao) ?? 0) + 1)
  const sessoes: SessoesPeriodo = {
    total: doPeriodo.length,
    emCurso: sessoesMapeadas.filter(s => !s.fim).length,
    desconexoes: sessoesMapeadas.filter(s => !!s.fim).length,
    motivos: [...motivos.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8),
    recentes: sessoesMapeadas.slice(0, 15),
    truncado,
  }

  const temCampos = doPeriodo.some(r => 'acctinputoctets' in r && 'acctoutputoctets' in r && (r.acctinputoctets != null || r.acctoutputoctets != null))
  if (!temCampos) {
    return { consumo: { disponivel: false, motivo: 'O IXC retornou as sessões, mas sem o volume de download e upload.' }, sessoes: { disponivel: true, ...sessoes } }
  }
  const porDia = new Map<string, ConsumoDia>()
  let down = 0
  let up = 0
  doPeriodo.forEach((r, i) => {
    const s = sessoesMapeadas[i]
    const dia = diaIxc(r.acctstarttime)!
    const e = porDia.get(dia) ?? { dia, downloadBytes: 0, uploadBytes: 0, sessoes: 0 }
    e.downloadBytes += s.downloadBytes ?? 0; e.uploadBytes += s.uploadBytes ?? 0; e.sessoes++
    down += s.downloadBytes ?? 0; up += s.uploadBytes ?? 0
    porDia.set(dia, e)
  })
  return {
    consumo: { disponivel: true, downloadBytes: down, uploadBytes: up, totalBytes: down + up, sessoes: doPeriodo.length, porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)) },
    sessoes: { disponivel: true, ...sessoes },
  }
}

async function lerSessoes(login: string, periodo: PeriodoConsulta): Promise<{ registros: RegistroSessao[]; truncado: boolean }> {
  const todos: RegistroSessao[] = []
  let truncado = false
  for (let pagina = 1; pagina <= MAX_PAGINAS_SESSOES; pagina++) {
    const regs: RegistroSessao[] = await listarIXC('radacct', { qtype: 'username', query: login, oper: '=', page: pagina, rp: POR_PAGINA, sortname: 'acctstarttime', sortorder: 'desc' })
    if (!regs || regs.length === 0) break
    todos.push(...regs)
    const ultimo = diaIxc(regs[regs.length - 1].acctstarttime)
    if (regs.length < POR_PAGINA || (ultimo && ultimo < periodo.inicio)) break
    if (pagina === MAX_PAGINAS_SESSOES) truncado = true
  }
  return { registros: todos, truncado }
}

// Codigos do IXC. Codigo desconhecido aparece como esta, sem inventar significado.
const TECNOLOGIA: Record<string, string> = { F: 'Fibra' }
const AUTENTICACAO: Record<string, string> = { L: 'PPPoE (login e senha)' }
export const rotuloTecnologia = (c: string | null) => (c ? (TECNOLOGIA[c] ?? `código ${c}`) : null)
export const rotuloAutenticacao = (c: string | null) => (c ? (AUTENTICACAO[c] ?? `código ${c}`) : null)

/** Conexao atual, a partir dos campos do proprio login no IXC (existem mesmo quando a tabela de sessoes nao e' exposta). */
export function sessaoAtualDe(login: LoginIxc | null): Disponibilidade<SessaoAtual> {
  if (!login) return { disponivel: false, motivo: 'Este contrato não tem login de conexão cadastrado no IXC.' }
  const s = login.sessaoAtual
  if (!s.inicio && s.downloadBytes == null && s.uploadBytes == null && s.tempoConectadoSegundos == null) {
    return { disponivel: false, motivo: 'O cadastro do login no IXC não traz dados da conexão atual.' }
  }
  return {
    disponivel: true, online: login.online, inicio: dataHoraIxc(s.inicio) ?? s.inicio, tempoConectadoSegundos: s.tempoConectadoSegundos,
    downloadBytes: s.downloadBytes, uploadBytes: s.uploadBytes, atualizadoEm: dataHoraIxc(s.atualizadoEm) ?? s.atualizadoEm,
    ultimaDesconexao: dataHoraIxc(s.fim) ?? s.fim, motivoUltimaDesconexao: s.motivoDesconexao, desconexoes: s.desconexoes,
  }
}

// ------------------------------------------------------------------ consulta completa
export interface ParametrosConsulta {
  codigoCliente: string
  contratoId?: string
  login?: string
  periodo?: string
  dataInicio?: string
  dataFim?: string
}

export const OBSERVACOES_PADRAO = [
  'Volume consumido (GB) não é velocidade (Mbps): o consumo registrado não comprova a qualidade nem a estabilidade da conexão.',
  'Download = volume enviado do concentrador ao cliente; upload = volume recebido do cliente (convenção padrão RADIUS). Confirme com o concentrador se necessário.',
  'O volume de cada sessão é atribuído ao dia em que ela começou; sessões longas concentram o consumo no dia de início.',
  'Em sessões em curso, o volume é parcial (até a última atualização feita pelo concentrador no IXC).',
]

export const OBSERVACAO_SESSAO_ATUAL = 'Volume da sessão atual é o contador que o IXC guarda no cadastro do login desde o início da conexão atual (zera quando a conexão cai e reconecta); não é consumo mensal nem velocidade.'
export const MOTIVO_SEM_HISTORICO = 'O IXC deste provedor não devolveu histórico de sessões para este login (a tabela de sessões não é exposta pela API). Veja a conexão atual abaixo.'

export async function consultarConexao(p: ParametrosConsulta, agora = new Date()): Promise<RespostaConsulta> {
  if (!/^\d+$/.test(p.codigoCliente)) throw new ErroDiagnostico('INVALIDO', 'Código de cliente inválido.')
  const periodo = resolverPeriodo(p, agora)

  let dados: DadosIxc
  try { dados = await dadosIxcDoCliente(p.codigoCliente) } catch (e) { throw mapearErroIxc(e) }
  const cliente = { codigo: p.codigoCliente, nome: dados.cliente.nome }
  if (!dados.cliente.nome && dados.contratos.length === 0 && dados.logins.length === 0) throw new ErroDiagnostico('NAO_ENCONTRADO', 'Cliente não encontrado no IXC.')

  const contratos = contratosDe(dados)
  if (contratos.length === 0) return { tipo: 'sem-contrato', cliente }
  let contrato: ContratoConexao | undefined
  if (p.contratoId) {
    contrato = contratos.find(c => c.id === p.contratoId)
    if (!contrato) throw new ErroDiagnostico('NAO_ENCONTRADO', 'Este contrato não pertence ao cliente informado.')
  } else if (contratos.length === 1) {
    contrato = contratos[0]
  } else {
    return { tipo: 'escolher-contrato', cliente, contratos }
  }

  let loginEscolhido = p.login
  if (loginEscolhido && !contrato.logins.some(l => l.login === loginEscolhido)) throw new ErroDiagnostico('NAO_ENCONTRADO', 'Este login não pertence ao contrato informado.')
  if (!loginEscolhido) {
    if (contrato.logins.length > 1) return { tipo: 'escolher-login', cliente, contrato }
    loginEscolhido = contrato.logins[0]?.login
  }
  const loginIxc = dados.logins.find(l => l.login === loginEscolhido) ?? null

  const rotuloDownload = loginIxc?.plano?.download ?? null
  const rotuloUpload = loginIxc?.plano?.upload ?? null
  const identificacao = {
    cliente,
    contrato: { id: contrato.id, plano: contrato.plano, status: contrato.status, internet: contrato.internet, velocidadeStatus: contrato.velocidadeStatus },
    login: loginIxc ? {
      login: loginIxc.login, online: loginIxc.online, ativo: loginIxc.ativo, ip: loginIxc.ip, mac: loginIxc.mac,
      ultimaConexao: dataHoraIxc(loginIxc.ultimaConexao) ?? loginIxc.ultimaConexao, tipoConexao: loginIxc.tipoConexao, concentrador: loginIxc.concentrador,
      ipv6: loginIxc.ipv6, interfaceConexao: loginIxc.conexao, tecnologia: rotuloTecnologia(loginIxc.tecnologia), autenticacao: rotuloAutenticacao(loginIxc.autenticacao),
    } : null,
    velocidade: {
      rotuloDownload, rotuloUpload, downloadMbps: paraMbps(rotuloDownload), uploadMbps: paraMbps(rotuloUpload),
      origem: loginIxc?.plano?.grupo ? `Plano de velocidade "${loginIxc.plano.grupo}" no IXC` : null,
    },
  }

  const observacoes = [...OBSERVACOES_PADRAO]
  let consumo: DiagnosticoConexao['consumo']
  let sessoes: DiagnosticoConexao['sessoes']
  if (!loginEscolhido) {
    const motivo = 'Este contrato não tem login de conexão cadastrado no IXC.'
    consumo = { disponivel: false, motivo }; sessoes = { disponivel: false, motivo }
  } else {
    try {
      const lidas = await lerSessoes(loginEscolhido, periodo)
      if (lidas.registros.length === 0) {
        // Nenhuma sessao em nenhum periodo: a API deste IXC nao expoe o historico (nao e' "consumo zero").
        consumo = { disponivel: false, motivo: MOTIVO_SEM_HISTORICO }; sessoes = { disponivel: false, motivo: MOTIVO_SEM_HISTORICO }
      } else {
        const ag = agregarSessoes(lidas.registros, periodo, lidas.truncado)
        consumo = ag.consumo; sessoes = ag.sessoes
      }
      if (lidas.truncado) observacoes.push('O período tem mais sessões do que o limite de leitura; os valores podem estar incompletos. Reduza o período.')
    } catch (e) {
      const erro = mapearErroIxc(e)
      const motivo = erro.codigo === 'IXC_NAO_CONFIGURADO' ? erro.message : 'O IXC não devolveu o histórico de sessões (tabela radacct) para este login. Verifique se a API do IXC expõe essa consulta.'
      consumo = { disponivel: false, motivo }; sessoes = { disponivel: false, motivo }
    }
  }

  const sessaoAtual = sessaoAtualDe(loginIxc)
  // Aba Fibra lida UMA vez: alimenta o equipamento (ONU) e a rede (OLT, PON, historico, vizinhos, OS).
  const fibra = await lerFibraRegistro(loginIxc?.id ?? null)
  const equipamento: Disponibilidade<EquipamentoOnu> = fibra.tipo === 'ok'
    ? await equipamentoDeRegistro(fibra.reg, loginIxc?.onuSerial ?? null)
    : { disponivel: false, motivo: 'Falha ao consultar a aba Fibra no IXC. Tente de novo; isto NÃO indica que a ONU esteja fora do ar.' }
  const rede = await lerRede(loginIxc ?? null, fibra, agora)
  const hipoteses = gerarHipoteses({ identificacao, equipamento, rede, sessaoAtual }, agora)
  // So comenta a convencao do historico (RADIUS) quando existe historico; a sessao atual tem observacao propria.
  const observacoesFinais = consumo.disponivel ? observacoes : [OBSERVACOES_PADRAO[0]]
  if (sessaoAtual.disponivel) observacoesFinais.push(OBSERVACAO_SESSAO_ATUAL)
  if (equipamento.disponivel) observacoesFinais.push('Sinal, temperatura e tensão da ONU são leituras da OLT registradas no IXC (aba Fibra) na data indicada; não são velocidade nem medem a estabilidade da conexão do cliente.')

  return {
    tipo: 'ok',
    diagnostico: { fonte: FONTE_ATIVA, consultadoEm: agora.toISOString(), periodo, identificacao, consumo, sessoes, sessaoAtual, equipamento, rede, hipoteses, naoMedidos: INDICADORES_NAO_MEDIDOS, observacoes: observacoesFinais },
  }
}
