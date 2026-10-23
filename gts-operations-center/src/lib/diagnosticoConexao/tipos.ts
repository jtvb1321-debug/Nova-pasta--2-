// Diagnostico de Conexao: tipos compartilhados (servico, API, tela, PDF e assistente).
// Regra central: so existe aqui o que o IXC realmente devolveu. Indicador sem dado e' "indisponivel"
// (nunca zero, nunca estimativa). Velocidade CONTRATADA, VOLUME consumido, velocidade MEDIDA e trafego
// INSTANTANEO sao coisas diferentes e nunca se misturam.

export const NAO_DISPONIVEL = 'Não disponível pelo IXC'

/** Fonte dos dados de conectividade. Hoje so 'ixc'; o resto fica reservado para integracoes futuras (inativas). */
export type FonteConectividade = 'ixc'
export const FONTES_FUTURAS = ['concentrador-pppoe', 'mikrotik'] as const

export interface ResultadoBusca {
  codigo: string
  nome: string
  /** Por que apareceu na busca (nome, codigo, contrato ou login). */
  origem: 'nome' | 'codigo' | 'contrato' | 'login'
}

export interface ContratoConexao {
  id: string
  plano: string | null
  status: string | null
  internet: string | null
  velocidadeStatus: string | null
  /** Logins (PPPoE) vinculados a este contrato. */
  logins: { login: string; online: boolean; ativo: boolean }[]
}

export interface VelocidadeContratada {
  /** Texto como esta no plano do IXC (ex.: "310M"). */
  rotuloDownload: string | null
  rotuloUpload: string | null
  downloadMbps: number | null
  uploadMbps: number | null
  /** De onde veio: grupo (plano de velocidade) do login no IXC. */
  origem: string | null
}

export interface IdentificacaoConexao {
  cliente: { codigo: string; nome: string | null }
  contrato: { id: string; plano: string | null; status: string | null; internet: string | null; velocidadeStatus: string | null }
  login: { login: string; online: boolean; ativo: boolean; ip: string | null; ipv6: string | null; mac: string | null; ultimaConexao: string | null; tipoConexao: string | null; concentrador: string | null; interfaceConexao: string | null; tecnologia: string | null; autenticacao: string | null } | null
  velocidade: VelocidadeContratada
}

export interface PeriodoConsulta {
  inicio: string // AAAA-MM-DD (inclusivo)
  fim: string    // AAAA-MM-DD (inclusivo)
  rotulo: string
  dias: number
}

export interface ConsumoDia {
  dia: string // AAAA-MM-DD
  downloadBytes: number
  uploadBytes: number
  sessoes: number
}

export interface SessaoConexao {
  inicio: string | null
  fim: string | null // null = em curso
  duracaoSegundos: number | null
  ip: string | null
  downloadBytes: number | null
  uploadBytes: number | null
  motivoDesconexao: string | null
}

export type Disponibilidade<T> = ({ disponivel: true } & T) | { disponivel: false; motivo: string }

export interface ConsumoPeriodo {
  downloadBytes: number
  uploadBytes: number
  totalBytes: number
  sessoes: number
  porDia: ConsumoDia[]
}

export interface SessoesPeriodo {
  total: number
  emCurso: number
  desconexoes: number
  motivos: { motivo: string; quantidade: number }[]
  recentes: SessaoConexao[]
  /** Se a lista foi cortada pelo limite de leitura (periodo muito longo ou muitas sessoes). */
  truncado: boolean
}

/** Indicadores que o IXC NAO fornece nesta consulta. Sempre mostrados como indisponiveis, nunca simulados. */
export const INDICADORES_NAO_MEDIDOS = ['Velocidade real medida', 'Latência', 'Jitter', 'Perda de pacotes', 'Estabilidade da conexão'] as const

/** Conexao ATUAL, como o proprio cadastro do login no IXC informa (contadores desde o inicio da sessao atual). */
export interface SessaoAtual {
  online: boolean
  inicio: string | null
  tempoConectadoSegundos: number | null
  downloadBytes: number | null
  uploadBytes: number | null
  atualizadoEm: string | null
  ultimaDesconexao: string | null
  motivoUltimaDesconexao: string | null
  desconexoes: number | null
}

/**
 * ONU do cliente: a aba "Fibra" do cadastro do login no IXC (sinal, temperatura, tensao, modelo) e, quando o serial
 * casa exatamente, o status da ONU no SmartOLT. Sinal e status sao leituras da OLT, nao medidas da conexao do cliente.
 */
export interface EquipamentoOnu {
  fonte: string
  modelo: string | null
  mac: string | null
  /** Sinal 0 ou vazio no IXC significa "sem leitura" e vira null (nunca 0 dBm). */
  sinalRxDbm: number | null
  sinalTxDbm: number | null
  temperaturaC: number | null
  voltagemV: number | null
  leituraEm: string | null
  causaUltimaQueda: string | null
  distanciaM: number | null
  statusOlt: string | null
  ultimaMudancaStatus: string | null
}

// ------------------------------------------------------------------ rede (tudo lido do IXC, somente leitura)
export interface OltIxc {
  id: string
  nome: string | null
  /** Como o IXC grava: HW = Huawei, VSOL = VSOL. Outro codigo aparece como esta. */
  fabricante: string | null
  modelo: string | null
  firmware: string | null
  ativa: boolean
  pop: string | null
  /** Uptime informado pelo IXC (texto) - so serve de referencia. */
  uptime: string | null
}

export interface PosicaoOnu {
  olt: OltIxc | null
  /** Identificador da PON como o IXC grava (ex.: 0/1/14 = quadro/slot/porta). */
  ponId: string | null
  slot: string | null
  pon: string | null
  onuNumero: string | null
  perfilId: string | null
  modeloOnu: string | null
  autenticacao: string | null
  vlans: { rotulo: string; valor: string }[]
  caixa: { id: string; nome: string | null; capacidade: number | null; porta: string | null } | null
  /** Interface de transmissao (porta da OLT) como o IXC referencia. */
  interfaceTransmissao: string | null
  mtu: string | null
}

export interface LeituraOptica {
  em: string
  rxDbm: number | null
  txDbm: number | null
  temperaturaC: number | null
  voltagemV: number | null
}

export interface HistoricoOptico {
  /** Do mais antigo para o mais novo (pronto para o grafico). Leituras sem nenhum sinal ficam de fora e sao contadas em semSinal. */
  leituras: LeituraOptica[]
  semSinal: number
  /** Quantas leituras foram lidas do IXC (as mais recentes, ate 120). */
  lidas: number
  ultimaValida: LeituraOptica | null
  /** Intervalo tipico entre leituras, em horas (mediana), quando ha leituras suficientes. */
  intervaloHoras: number | null
}

/** Vizinhos da caixa (sem o proprio cliente). indefinidos = estado que o IXC grava com outro codigo (nao e online nem offline). */
export interface VizinhancaCaixa { total: number; online: number; offline: number; indefinidos: number; capacidade: number | null; caidosRecentes: number }
export interface VizinhancaPon {
  ponId: string
  totalOnus: number
  comLeitura: number
  semLeitura: number
  /** Leituras de RX abaixo do limite de atencao entre as ONUs com leitura. */
  rxFraco: number
  rxMedianoDbm: number | null
  ultimaLeituraEm: string | null
}

export interface OrdemServicoIxc {
  id: string
  abertaEm: string | null
  fechadaEm: string | null
  status: string | null
  statusRotulo: string | null
  assunto: string | null
  prioridade: string | null
}

export interface RedeIxc {
  consultadoEm: string
  posicao: Disponibilidade<PosicaoOnu>
  historico: Disponibilidade<HistoricoOptico>
  vizinhanca: Disponibilidade<{ caixa: VizinhancaCaixa | null; pon: VizinhancaPon | null }>
  ordensServico: Disponibilidade<{ total: number; recentes: OrdemServicoIxc[] }>
}

export type Confianca = 'alta' | 'media' | 'baixa'
export interface Hipotese {
  id: string
  titulo: string
  severidade: 'info' | 'atencao' | 'critico'
  confianca: Confianca
  evidencias: { texto: string; em: string | null }[]
  proximoTeste: string
}

export interface DiagnosticoConexao {
  fonte: FonteConectividade
  consultadoEm: string
  periodo: PeriodoConsulta
  identificacao: IdentificacaoConexao
  consumo: Disponibilidade<ConsumoPeriodo>
  sessoes: Disponibilidade<SessoesPeriodo>
  sessaoAtual: Disponibilidade<SessaoAtual>
  equipamento: Disponibilidade<EquipamentoOnu>
  rede: RedeIxc
  hipoteses: Hipotese[]
  naoMedidos: readonly string[]
  /** Avisos tecnicos sobre como ler os numeros (ex.: convencao de upload/download). */
  observacoes: string[]
}

export type RespostaConsulta =
  | { tipo: 'ok'; diagnostico: DiagnosticoConexao }
  | { tipo: 'escolher-contrato'; cliente: { codigo: string; nome: string | null }; contratos: ContratoConexao[] }
  | { tipo: 'escolher-login'; cliente: { codigo: string; nome: string | null }; contrato: ContratoConexao }
  | { tipo: 'sem-contrato'; cliente: { codigo: string; nome: string | null } }

export class ErroDiagnostico extends Error {
  constructor(public codigo: 'INVALIDO' | 'NAO_ENCONTRADO' | 'IXC_INDISPONIVEL' | 'IXC_NAO_CONFIGURADO', mensagem: string) {
    super(mensagem)
    this.name = 'ErroDiagnostico'
  }
}
