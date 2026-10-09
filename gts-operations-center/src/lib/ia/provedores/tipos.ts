// Contrato dos provedores de IA. O assistente so conhece esta interface; trocar de provedor
// nao muda ferramentas, permissoes nem auditoria.

export type PapelProvedor = 'system' | 'user' | 'assistant' | 'tool'

export interface ChamadaFerramentaModelo {
  id: string
  nome: string
  /** Texto JSON exatamente como o modelo devolveu. Validado depois pelo executor. */
  argumentos: string
}

export interface MensagemProvedor {
  role: PapelProvedor
  content: string | null
  tool_calls?: ChamadaFerramentaModelo[]
  tool_call_id?: string
}

export interface DefinicaoFerramentaModelo {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface EntradaProvedor {
  mensagens: MensagemProvedor[]
  ferramentas: DefinicaoFerramentaModelo[]
  maxTokens: number
  timeoutMs: number
}

export interface RespostaProvedor {
  texto: string | null
  chamadas: ChamadaFerramentaModelo[]
  modelo: string
  provedor: 'mock' | 'openrouter'
  /** Verdadeiro quando a resposta NAO veio de um modelo de IA de verdade. */
  simulada: boolean
  uso?: { tokensEntrada?: number; tokensSaida?: number }
}

export type CodigoErroProvedor =
  | 'CONFIGURACAO'
  | 'AUTENTICACAO'
  | 'COTA'
  | 'TIMEOUT'
  | 'INDISPONIVEL'
  | 'MODELO_NAO_GRATUITO'
  | 'RESPOSTA_INVALIDA'

export class ErroProvedor extends Error {
  constructor(public codigo: CodigoErroProvedor, mensagem: string) {
    super(mensagem)
    this.name = 'ErroProvedor'
  }
}

export interface Provedor {
  nome: 'mock' | 'openrouter'
  completar(entrada: EntradaProvedor): Promise<RespostaProvedor>
}

/** Mensagem amigavel (sem detalhes tecnicos) para cada falha do provedor. */
export function mensagemErroProvedor(e: ErroProvedor): string {
  switch (e.codigo) {
    case 'COTA': return 'O limite gratuito do provedor de IA foi atingido. Tente de novo mais tarde.'
    case 'AUTENTICACAO': return 'O provedor de IA recusou a chave configurada. Peça ao administrador para conferir a configuração.'
    case 'TIMEOUT': return 'O provedor de IA demorou demais para responder. Tente novamente.'
    case 'INDISPONIVEL': return 'O provedor de IA está indisponível agora. Tente novamente em instantes.'
    case 'MODELO_NAO_GRATUITO': return 'O modelo configurado não é gratuito ou não está disponível. A IA foi bloqueada para evitar cobrança.'
    case 'RESPOSTA_INVALIDA': return 'O provedor de IA devolveu uma resposta inválida. Tente novamente.'
    case 'CONFIGURACAO': return 'A IA não está configurada corretamente. Peça ao administrador para conferir o ambiente.'
  }
}
