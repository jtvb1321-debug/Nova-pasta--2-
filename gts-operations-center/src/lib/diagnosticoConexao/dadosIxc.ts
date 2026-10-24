import { listarIXC } from '@/lib/ixc'
import { comCache } from '@/lib/inmapCache'
import { formatarVelocidade } from '@/lib/ixcFormato'
import { formatarBytes, formatarDuracao } from './formato'
import { ErroDiagnostico } from './tipos'

// "Dados do IXC": TODOS os campos que o IXC devolve para o cliente, o contrato, o login (PPPoE), a ONU (aba Fibra) e a caixa FTTH,
// em grupos de rotulo/valor, SOMENTE LEITURA. O que fica de fora, sempre:
//   - senhas, usuarios de acesso a equipamentos, tokens e comandos/scripts de ONU (so saem em lerCredenciais, sob demanda e auditado);
//   - CPF/CNPJ, RG, inscricao estadual e demais documentos.
// Valor vazio, "0" e data zerada ("0000-00-00") nao sao mostrados.

export interface CampoIxc { campo: string; rotulo: string; valor: string }
export interface GrupoIxc { id: string; titulo: string; campos: CampoIxc[] }

export interface AcessoRoteador {
  ip: string | null
  portaPrincipal: string | null
  portaSecundaria: string | null
  tipoAcesso: string | null
  /** Enderecos prontos para abrir. So existem se o IP for um IPv4 valido e a porta numerica. */
  urlPrincipal: string | null
  urlSecundaria: string | null
}

export interface DadosCompletosIxc {
  consultadoEm: string
  grupos: GrupoIxc[]
  roteador: AcessoRoteador
  /** Quantos campos foram deixados de fora por serem segredo ou documento (so a contagem). */
  camposProtegidos: number
}

/** Campos que nunca saem em "dados completos". */
export const CAMPO_PROTEGIDO = /senha|password|passwd|^usuario_|^login_onu|_hash|md5|token|secret|chave|cnpj_cpf|^cpf|^cnpj|^rg$|^ie$|inscricao|identidade|^comandos$|^script|carteira|doc_|^cpf_|dados_bancarios|_wpa|^usuario_wpa/i
/** Campos que sao tecnicos mas guardam credenciais indiretas. */
const CAMPO_OCULTO_EXTRA = /^id_senha|^wps|^pin/i

const ROTULOS: Record<string, string> = {
  id: 'Código no IXC', razao: 'Razão social / nome', fantasia: 'Nome fantasia', tipo_pessoa: 'Tipo de pessoa', ativo: 'Ativo', data_cadastro: 'Data de cadastro', data_nascimento: 'Data de nascimento',
  endereco: 'Endereço', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', cep: 'CEP', cidade: 'Cidade (código)', uf: 'UF', referencia: 'Referência', latitude: 'Latitude', longitude: 'Longitude',
  fone: 'Telefone', telefone_celular: 'Celular', telefone_comercial: 'Telefone comercial', whatsapp: 'WhatsApp', email: 'E-mail', hotsite_email: 'E-mail do hotsite', contribuinte_icms: 'Contribuinte ICMS',
  id_cliente: 'Cliente (código)', id_contrato: 'Contrato (código)', id_vd_contrato: 'Plano de venda (código)', contrato: 'Contrato (descrição)', status: 'Situação', status_internet: 'Situação da internet', status_velocidade: 'Situação da velocidade',
  data_ativacao: 'Data de ativação', data_cancelamento: 'Data de cancelamento', data_renovacao: 'Data de renovação', data_expiracao: 'Data de expiração', data_negativacao: 'Data de negativação', data_acesso_desativado: 'Data de acesso desativado',
  data_ultima_alteracao: 'Última alteração', ultima_atualizacao: 'Última atualização', obs_cancelamento: 'Observação do cancelamento', motivo_cancelamento: 'Motivo do cancelamento', dia_vencimento: 'Dia de vencimento',
  login: 'Login PPPoE', online: 'Conectado agora', ip: 'IPv4', mac: 'MAC', pd_ipv6: 'IPv6 (prefixo)', concentrador: 'Concentrador', id_concentrador: 'Concentrador (código)', conexao: 'Interface de conexão', tipo_conexao: 'Tipo de conexão',
  interface_transmissao: 'Interface de transmissão (código)', id_transmissor: 'OLT (código)', id_caixa_ftth: 'Caixa FTTH (código)', ftth_porta: 'Porta na caixa', onu_mac: 'MAC/serial da ONU', mtu: 'MTU', id_grupo: 'Plano de velocidade (código)',
  ultima_conexao_inicial: 'Última conexão iniciada', ultima_conexao_final: 'Última conexão encerrada', tempo_conectado: 'Tempo conectado', download_atual: 'Download da sessão atual', upload_atual: 'Upload da sessão atual',
  motivo_desconexao: 'Motivo da última desconexão', count_desconexao: 'Desconexões contadas', ip_aviso: 'IP de aviso', porta_http: 'Porta HTTP do roteador', porta_router2: 'Porta secundária do roteador', tipo_acesso: 'Tipo de acesso ao roteador',
  autenticacao: 'Autenticação', autenticacao_mac: 'Autenticação por MAC', tipo_conexao_mapa: 'Tecnologia', id_df_projeto: 'Projeto (código)', id_filial: 'Filial (código)',
  slotno: 'Slot / placa', ponno: 'Porta PON', ponid: 'PON (quadro/slot/porta)', onu_numero: 'Nº da ONU na PON', onu_tipo: 'Modelo da ONU', id_perfil: 'Perfil (código)', vlan: 'VLAN', vlan_pppoe: 'VLAN PPPoE', vlan_dhcp: 'VLAN DHCP',
  vlan_tr69: 'VLAN TR-069', vlan_iptv: 'VLAN IPTV', vlan_voip: 'VLAN VoIP', vlan_outros: 'Outras VLANs', service_port: 'Service-port', tipo_autenticacao: 'Autenticação da ONU', data_sinal: 'Data da leitura de sinal', sinal_rx: 'Sinal RX', sinal_tx: 'Sinal TX',
  temperatura: 'Temperatura', voltagem: 'Tensão', distancia_onu: 'Distância da ONU', porta_ftth: 'Porta na caixa', causa_ultima_queda: 'Causa da última queda', id_hardware: 'Hardware (código)', ip_gerencia: 'IP de gerência', versao: 'Versão',
  descricao: 'Descrição', capacidade: 'Capacidade', tipo: 'Tipo', obs: 'Observação', observacao: 'Observação', nome: 'Nome',
  // contrato
  data_assinatura: 'Data de assinatura', data_cadastro_sistema: 'Cadastrado no sistema em', data: 'Data do contrato', pago_ate_data: 'Pago até', nao_bloquear_ate: 'Não bloquear até', data_desistencia: 'Data de desistência',
  data_inicial_suspensao: 'Início da suspensão', data_final_suspensao: 'Fim da suspensão', data_retomada_contrato: 'Retomada do contrato', dt_ult_bloq_auto: 'Último bloqueio automático', dt_ult_bloq_manual: 'Último bloqueio manual',
  dt_ult_desbloq_auto: 'Último desbloqueio automático', dt_ult_desbloq_manual: 'Último desbloqueio manual', dt_ult_des_bloq_conf: 'Último desbloqueio de confiança', bloqueio_automatico: 'Bloqueio automático',
  contrato_suspenso: 'Contrato suspenso', desbloqueio_confianca: 'Desbloqueio de confiança', desbloqueio_confianca_ativo: 'Desbloqueio de confiança ativo', restricao_auto_desbloqueio: 'Restrição ao desbloqueio automático',
  liberacao_bloqueio_manual: 'Liberação de bloqueio manual', aplicar_desconto_tempo_bloqueio: 'Desconto pelo tempo de bloqueio', tempo_permanencia: 'Tempo de permanência (meses)', fidelidade: 'Fidelidade', renovacao_automatica: 'Renovação automática',
  aviso_atraso: 'Aviso de atraso', isentar_contrato: 'Contrato isento', tipo_cobranca: 'Tipo de cobrança', id_vendedor: 'Vendedor (código)', id_vendedor_ativ: 'Vendedor da ativação (código)', id_carteira_cobranca: 'Carteira de cobrança (código)',
  id_tipo_contrato: 'Tipo de contrato (código)', id_modelo: 'Modelo de contrato (código)', id_tipo_documento: 'Tipo de documento (código)', motivo_inclusao: 'Motivo da inclusão', origem_cancelamento: 'Origem do cancelamento',
  situacao_financeira_contrato: 'Situação financeira', taxa_improdutiva: 'Taxa improdutiva', assinatura_digital: 'Assinatura digital', agrupar_financeiro_contrato: 'Agrupar financeiro',
  // plano
  valor_contrato: 'Valor do plano', valor_produto: 'Valor do produto', moeda: 'Moeda', logins_simultaneos: 'Logins simultâneos', limitar_n_logins: 'Limitar nº de logins', Ativo: 'Plano ativo', grupo: 'Plano de velocidade',
  download: 'Download', upload: 'Upload', tipo_franquia: 'Tipo de franquia', prioridade: 'Prioridade', type_band_control: 'Controle de banda', sici_tecnologia: 'Tecnologia (SICI)', qos_ativo: 'QoS ativo', tipo_pessoa_plano: 'Tipo de pessoa',
  // fibra, caixa e OLT
  tipo_integracao_neutra: 'Integração rede neutra', onu_rede_neutra: 'ONU de rede neutra', radpop_estrutura: 'Estrutura (código)', id_radpop_radio_porta: 'Porta da OLT (código)', status_caixa: 'Situação da caixa',
  fabricante_modelo: 'Fabricante e modelo', modelo: 'Modelo', fwversion: 'Versão de software', uptime: 'Tempo ligada', endereco_padrao_cliente: 'Usa o endereço do cliente',
}
const humanizar = (c: string) => { const s = c.replace(/^id_/, '').replace(/_/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : c }
const rotuloDe = (c: string) => ROTULOS[c] ?? humanizar(c)

const BRUTO_VAZIO = (v: unknown) => { const s = v == null ? '' : String(v).trim(); return s === '' || s === '0' || s.toLowerCase() === 'null' || /^0000-00-00/.test(s) || s === '0.00' }
const SIM_NAO: Record<string, string> = { S: 'Sim', N: 'Não' }

// Codigos que o IXC grava, com o texto que a tela do IXC mostra. Codigo desconhecido aparece como esta (sem inventar significado).
export const CODIGOS: Record<string, Record<string, string>> = {
  status: { P: 'Pré-contrato', A: 'Ativo', I: 'Inativo', N: 'Negativado', D: 'Desistiu', C: 'Cancelado' },
  status_internet: { A: 'Ativa', D: 'Desativada', CM: 'Bloqueio manual', CA: 'Bloqueio automático', FA: 'Financeiro em atraso', AA: 'Aguardando assinatura' },
  status_velocidade: { N: 'Normal', R: 'Reduzida' },
  tipo_conexao_mapa: { F: 'Fibra' },
  autenticacao: { L: 'PPPoE (login e senha)' },
  tipo_pessoa: { F: 'Pessoa física', J: 'Pessoa jurídica', T: 'Todas' },
  tipo: { I: 'Internet' },
  tipo_cobranca: { P: 'Pós-pago', R: 'Pré-pago' },
}
const MOEDA = /^(valor_|taxa_|desconto|multa|juros)/
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/
const CAMPO_DATA = /(^|_)(data|dt|ultima|ult|ate|em)(_|$)/

export function formatarValor(campo: string, v: unknown): string {
  const s = String(v ?? '').trim()
  const codigos = CODIGOS[campo]
  if (codigos) return codigos[s] ?? codigos[s.toUpperCase()] ?? s
  if (/^[SN]$/i.test(s) && !/^(status|tipo)/.test(campo)) return SIM_NAO[s.toUpperCase()]
  const m = s.match(ISO)
  if (m && CAMPO_DATA.test(campo)) return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`
  const n = Number(s.replace(',', '.'))
  if (s !== '' && Number.isFinite(n)) {
    if (MOEDA.test(campo) || campo === 'valor_contrato') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    if (campo === 'sinal_rx' || campo === 'sinal_tx') return `${n.toLocaleString('pt-BR')} dBm`
    if (campo === 'temperatura') return `${n.toLocaleString('pt-BR')} °C`
    if (campo === 'voltagem') return `${n.toLocaleString('pt-BR')} V`
    if (campo === 'distancia_onu') return `${n.toLocaleString('pt-BR')} m`
    if (campo === 'tempo_conectado') return formatarDuracao(n)
    if (campo === 'download_atual' || campo === 'upload_atual') return formatarBytes(n)
  }
  if (/^(download|upload|dici_download)$/.test(campo)) return formatarVelocidade(s) ?? s
  return s.length > 300 ? `${s.slice(0, 300)}…` : s
}

/** Converte um registro do IXC em campos exibiveis (sem segredos nem documentos). Funcao pura. */
export function camposDe(reg: any, extraOcultos: string[] = []): { campos: CampoIxc[]; protegidos: number } {
  if (!reg || typeof reg !== 'object') return { campos: [], protegidos: 0 }
  let protegidos = 0
  const campos: CampoIxc[] = []
  for (const [campo, v] of Object.entries(reg)) {
    if (CAMPO_PROTEGIDO.test(campo) || CAMPO_OCULTO_EXTRA.test(campo) || extraOcultos.includes(campo)) { if (!BRUTO_VAZIO(v)) protegidos++; continue }
    if (BRUTO_VAZIO(v) || typeof v === 'object') continue
    campos.push({ campo, rotulo: rotuloDe(campo), valor: formatarValor(campo, v) })
  }
  return { campos, protegidos }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
export function acessoRoteadorDe(login: any): AcessoRoteador {
  const t = (v: unknown) => { const s = String(v ?? '').trim(); return s && s !== '0' ? s : null }
  const ip = t(login?.ip)
  const ipOk = !!ip && IPV4.test(ip) && ip.split('.').every(p => Number(p) <= 255)
  const porta = (p: string | null) => (p && /^\d{1,5}$/.test(p) && Number(p) > 0 && Number(p) <= 65535 ? p : null)
  const p1 = porta(t(login?.porta_http)), p2 = porta(t(login?.porta_router2))
  const tipo = t(login?.tipo_acesso)
  const esquema = tipo && /https/i.test(tipo) ? 'https' : 'http'
  return {
    ip, portaPrincipal: p1, portaSecundaria: p2, tipoAcesso: tipo,
    urlPrincipal: ipOk && p1 ? `${esquema}://${ip}:${p1}` : null,
    urlSecundaria: ipOk && p2 ? `${esquema}://${ip}:${p2}` : null,
  }
}

const um = (tabela: string, id: string) => listarIXC(tabela, { qtype: 'id', query: id, oper: '=', rp: 1 }).then(r => r[0] ?? null).catch(() => null)
const cidadeNome = (id: string | null) => (id && /^\d+$/.test(id) ? comCache(`dados-cidade:${id}`, async () => { const c: any = await um('cidade', id); return c?.nome ? String(c.nome) : null }, 6 * 60 * 60_000) : Promise.resolve(null))

export async function lerDadosCompletos(p: { codigoCliente: string; contratoId?: string | null; login?: string | null }): Promise<DadosCompletosIxc> {
  if (!/^\d+$/.test(p.codigoCliente)) throw new ErroDiagnostico('INVALIDO', 'Código de cliente inválido.')
  const cliente: any = await um('cliente', p.codigoCliente)
  if (!cliente) throw new ErroDiagnostico('NAO_ENCONTRADO', 'Cliente não encontrado no IXC.')

  const logins = (await listarIXC('radusuarios', { qtype: 'id_cliente', query: p.codigoCliente, oper: '=', rp: 30 }).catch(() => [])) as any[]
  const login = logins.find(l => (p.login && l.login === p.login) || (!p.login && p.contratoId && String(l.id_contrato) === p.contratoId)) ?? (logins.length === 1 ? logins[0] : null)
  const contratoId = p.contratoId ?? (login ? String(login.id_contrato) : null)
  const contrato = contratoId ? await um('cliente_contrato', contratoId) : null
  const plano = contrato?.id_vd_contrato ? await um('vd_contratos', String(contrato.id_vd_contrato)) : null
  const grupoVel = login?.id_grupo ? await um('radgrupos', String(login.id_grupo)) : null
  const fibra: any = login?.id ? ((await listarIXC('radpop_radio_cliente_fibra', { qtype: 'id_login', query: String(login.id), oper: '=', rp: 1 }).catch(() => [])) as any[])[0] ?? null : null
  const idCaixa = String(fibra?.id_caixa_ftth ?? login?.id_caixa_ftth ?? '')
  const caixa = /^\d+$/.test(idCaixa) ? await um('rad_caixa_ftth', idCaixa) : null
  const cidade = await cidadeNome(cliente.cidade ? String(cliente.cidade) : null)

  let protegidos = 0
  const montar = (id: string, titulo: string, reg: any, extra: CampoIxc[] = []): GrupoIxc | null => {
    const r = camposDe(reg)
    protegidos += r.protegidos
    const campos = [...extra, ...r.campos]
    return campos.length ? { id, titulo, campos } : null
  }
  const grupos = [
    montar('cliente', 'Cliente', cliente, cidade ? [{ campo: 'cidade_nome', rotulo: 'Cidade', valor: cidade }] : []),
    montar('contrato', 'Contrato', contrato),
    montar('plano', 'Plano de venda', plano),
    montar('velocidade', 'Plano de velocidade (RADIUS)', grupoVel),
    montar('login', 'Login de conexão (PPPoE)', login),
    montar('fibra', 'ONU e fibra (aba Fibra)', fibra),
    montar('caixa', 'Caixa FTTH', caixa),
  ].filter((g): g is GrupoIxc => !!g)
  return { consultadoEm: new Date().toISOString(), grupos, roteador: acessoRoteadorDe(login), camposProtegidos: protegidos }
}

// ------------------------------------------------------------------ credenciais (sob demanda, auditado na rota)
export interface CredenciaisConexao {
  senhaPppoe: string | null
  usuarioRoteador: string | null
  senhaRoteador1: string | null
  senhaRoteador2: string | null
  senhaWifi: string | null
  senhaWifi5g: string | null
}
const s = (v: unknown) => { const t = String(v ?? '').trim(); return t && t.toLowerCase() !== 'null' ? t : null }

export function mapearCredenciaisConexao(reg: any): CredenciaisConexao {
  return {
    senhaPppoe: s(reg?.senha), usuarioRoteador: s(reg?.usuario_router1), senhaRoteador1: s(reg?.senha_router1), senhaRoteador2: s(reg?.senha_router2),
    senhaWifi: s(reg?.senha_rede_sem_fio), senhaWifi5g: s(reg?.senha_rede_sem_fio_5ghz),
  }
}

/** Credenciais de UM login do cliente. Nunca em cache: quem chama audita e responde com Cache-Control: no-store. */
export async function lerCredenciais(p: { codigoCliente: string; login: string }): Promise<{ login: string; credenciais: CredenciaisConexao }> {
  if (!/^\d+$/.test(p.codigoCliente)) throw new ErroDiagnostico('INVALIDO', 'Código de cliente inválido.')
  if (!/^[\w.@-]{1,80}$/.test(p.login)) throw new ErroDiagnostico('INVALIDO', 'Login inválido.')
  const logins = (await listarIXC('radusuarios', { qtype: 'id_cliente', query: p.codigoCliente, oper: '=', rp: 30 })) as any[]
  const reg = logins.find(l => l.login === p.login)
  if (!reg) throw new ErroDiagnostico('NAO_ENCONTRADO', 'Este login não pertence ao cliente informado.')
  return { login: p.login, credenciais: mapearCredenciaisConexao(reg) }
}
