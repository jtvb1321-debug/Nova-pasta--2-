import type { Permission } from '@/lib/permissions'

// Tipos comuns do assistente. Nada aqui depende de protocolo (chat interno ou MCP).

export type AreaFerramenta = 'operacoes' | 'estoque'
export type OrigemChamada = 'chat' | 'mcp'

export type PermissoesIA = Pick<
  Permission,
  'usarAssistenteIA' | 'iaOperacional' | 'iaEstoque' | 'verDesempenho' | 'verEstoque' | 'apenasMinhaEquipe'
>

/** Quem esta consultando. Montado no servidor a partir da sessao - nunca vem do modelo. */
export interface ContextoIA {
  usuarioId: string
  nome?: string | null
  role: string
  permissoes: PermissoesIA
  /** Quando preenchido, o usuario so enxerga dados dessa equipe (escopo). */
  escopoEquipeId: string | null
  origem: OrigemChamada
  conversaId?: string | null
  ip?: string | null
}

export interface Indicador {
  rotulo: string
  valor: string | number
  detalhe?: string
  tom?: 'neutro' | 'ok' | 'alerta' | 'perigo'
}

export interface Referencia {
  tipo: 'chamado' | 'item' | 'equipe' | 'equipamento' | 'movimentacao' | 'termo' | 'devolucao'
  id: string
  rotulo: string
}

export interface FonteConsulta {
  consultadoEm: string
  tabelas: string[]
}

/** Resultado padrao de qualquer ferramenta. Todo numero daqui vem do banco. */
export interface ResultadoFerramenta {
  resumo: string
  dados: unknown
  indicadores: Indicador[]
  referencias: Referencia[]
  recomendacoes: string[]
  avisos: string[]
  fonte: FonteConsulta
  /** Verdadeiro quando ha mais registros do que o limite devolvido. */
  truncado?: boolean
}

export class ErroFerramenta extends Error {
  constructor(
    public codigo: 'NEGADO' | 'INVALIDO' | 'NAO_ENCONTRADO' | 'LIMITE' | 'TIMEOUT' | 'ERRO',
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroFerramenta'
  }
}
