import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { AreaFerramenta, ContextoIA, ResultadoFerramenta } from './tipos'
import { esquemaPaginacao, esquemaPeriodo } from './periodo'
import * as op from './servicos/operacoes'
import * as est from './servicos/estoque'

// Registro unico de ferramentas, independente de protocolo: o assistente interno e o servidor MCP
// usam exatamente estas definicoes e passam pelo mesmo executor (validacao, permissao, auditoria).
// TODAS sao somente leitura. Nao existe ferramenta que escreve, apaga, transfere, da baixa ou compra.

export interface FerramentaIA {
  nome: string
  descricao: string
  area: AreaFerramenta
  parametros: z.ZodObject<z.ZodRawShape>
  executar: (ctx: ContextoIA, args: any) => Promise<ResultadoFerramenta>
}

const idSeguro = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'id inválido')
const equipeId = idSeguro.optional().describe('Id da equipe (opcional). Veja a lista de equipes nos resultados.')
const textoCurto = (descricao: string) => z.string().trim().min(1).max(60).optional().describe(descricao)
const tipoChamado = z.enum(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'ROMPIMENTO_MASSIVO', 'SUPORTE'])
const categoria = z.enum(['GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA', 'MANINFO']).optional().describe('Categoria do estoque.')
const objeto = <T extends z.ZodRawShape>(forma: T) => z.object(forma).strict()

export const FERRAMENTAS: FerramentaIA[] = [
  // ------------------------------------------------------------ operacoes
  {
    nome: 'resumo_diario_chamados', area: 'operacoes',
    descricao: 'Resumo do dia: chamados finalizados, abertos, em atendimento, agendados e com SLA estourado agora. Separa EACE de convencional.',
    parametros: objeto({ equipeId }), executar: (c, a) => op.resumoDiarioChamados(c, a),
  },
  {
    nome: 'chamados_criticos', area: 'operacoes',
    descricao: 'Lista chamados críticos agora: marcados como crítico/urgente, rompimento massivo, SLA estourado ou reincidência, do mais grave ao menos grave.',
    parametros: objeto({ equipeId, ...esquemaPaginacao }), executar: (c, a) => op.chamadosCriticos(c, a),
  },
  {
    nome: 'analisar_sla', area: 'operacoes',
    descricao: 'Análise de SLA de resposta e resolução no período, separada entre chamados convencionais e EACE (no EACE o SLA começa no início do atendimento).',
    parametros: objeto({ ...esquemaPeriodo, equipeId, tipo: tipoChamado.optional() }), executar: (c, a) => op.analisarSla(c, a),
  },
  {
    nome: 'comparar_equipes', area: 'operacoes',
    descricao: 'Compara as equipes no período: chamados concluídos, SLA, tempo médio de atendimento e avaliação média (só avaliações aprovadas).',
    parametros: objeto({ ...esquemaPeriodo }), executar: (c, a) => op.compararEquipes(c, a),
  },
  {
    nome: 'produtividade', area: 'operacoes',
    descricao: 'Produtividade no período: chamados concluídos por equipe, por tipo e média por dia. A produtividade é por equipe, não por técnico.',
    parametros: objeto({ ...esquemaPeriodo, equipeId }), executar: (c, a) => op.produtividade(c, a),
  },
  {
    nome: 'consultar_metas', area: 'operacoes',
    descricao: 'Metas de SLA vigentes no sistema e a regra do EACE. Informa que não há metas de produtividade cadastradas.',
    parametros: objeto({}), executar: (c) => op.consultarMetas(c),
  },
  {
    nome: 'atendimentos_pendentes', area: 'operacoes',
    descricao: 'Atendimentos pendentes (agendados, abertos e em andamento) por equipe e tipo, com os mais antigos.',
    parametros: objeto({ equipeId, ...esquemaPaginacao }), executar: (c, a) => op.atendimentosPendentes(c, a),
  },
  {
    nome: 'tendencias_desempenho', area: 'operacoes',
    descricao: 'Tendência semanal de volume e de SLA de resolução (convencional e EACE separados), calculada por regra fixa.',
    parametros: objeto({ semanas: z.number().int().min(5).max(12).optional().describe('Quantas semanas (5-12). Padrão 8.'), equipeId }),
    executar: (c, a) => op.tendenciasDesempenho(c, a),
  },
  // ------------------------------------------------------------ estoque
  {
    nome: 'consultar_estoque', area: 'estoque',
    descricao: 'Consulta produtos do estoque: código, descrição, unidade, saldo total, saldo por depósito, nos carros, reservado para chamados pendentes e estoque mínimo cadastrado.',
    parametros: objeto({ busca: textoCurto('Texto do código ou da descrição.'), categoria, deposito: textoCurto('Nome (ou parte) do depósito.'), ...esquemaPaginacao }),
    executar: (c, a) => est.consultarEstoque(c, a),
  },
  {
    nome: 'materiais_abaixo_minimo', area: 'estoque',
    descricao: 'Materiais abaixo (ou exatamente no limite) do estoque mínimo cadastrado, com o déficit calculado. Não inventa mínimos ausentes.',
    parametros: objeto({ categoria, ...esquemaPaginacao }), executar: (c, a) => est.materiaisAbaixoMinimo(c, a),
  },
  {
    nome: 'consultar_movimentacoes', area: 'estoque',
    descricao: 'Movimentações de estoque por período, tipo, produto ou equipe. Distingue movimentações físicas (entrada, saída, transferência, devolução) de reservas.',
    parametros: objeto({
      ...esquemaPeriodo, tipo: z.enum(['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'RESERVA', 'DEVOLUCAO']).optional(),
      itemBusca: textoCurto('Texto do código ou da descrição do produto.'), equipeId, ...esquemaPaginacao,
    }),
    executar: (c, a) => est.consultarMovimentacoes(c, a),
  },
  {
    nome: 'materiais_por_equipe', area: 'estoque',
    descricao: 'Materiais por equipe: entregue, utilizado, devolvido, transferido e pendente de prestação de contas (termos de retirada), saldo atual no carro e equipamentos com serial.',
    parametros: objeto({ equipeId, ...esquemaPeriodo, ...esquemaPaginacao }), executar: (c, a) => est.materiaisPorEquipe(c, a),
  },
  {
    nome: 'consultar_equipamento', area: 'estoque',
    descricao: 'Localiza um equipamento pelo serial, MAC ou patrimônio e mostra situação, onde está, vínculo com chamado (só o número da OS) e histórico.',
    parametros: objeto({ serial: z.string().trim().min(4).max(40).describe('Serial, MAC ou patrimônio.') }), executar: (c, a) => est.consultarEquipamento(c, a),
  },
  {
    nome: 'analisar_consumo', area: 'estoque',
    descricao: 'Consumo histórico de materiais (utilizados em chamados finalizados) por período, equipe, tipo de serviço e produto, com médias e tendência calculadas, sempre por unidade de medida.',
    parametros: objeto({ ...esquemaPeriodo, equipeId, tipoServico: tipoChamado.optional(), itemBusca: textoCurto('Texto do produto.'), limite: esquemaPaginacao.limite }),
    executar: (c, a) => est.analisarConsumo(c, a),
  },
  {
    nome: 'prever_reposicao', area: 'estoque',
    descricao: 'Previsão APROXIMADA de reposição: saldo livre, estoque mínimo, consumo histórico, reservas e instalações pendentes. Só sugere quantidades com dados suficientes. Não compra nada.',
    parametros: objeto({ horizonteDias: z.number().int().min(7).max(90).optional().describe('Dias à frente (7-90). Padrão 30.'), itemBusca: textoCurto('Texto do produto.'), categoria, ...esquemaPaginacao }),
    executar: (c, a) => est.preverReposicao(c, a),
  },
  {
    nome: 'consultar_devolucoes', area: 'estoque',
    descricao: 'Devoluções de material aguardando aprovação do estoque e termos abertos com material pendente. Nunca classifica itens como perdidos ou extraviados.',
    parametros: objeto({ equipeId, ...esquemaPaginacao }), executar: (c, a) => est.consultarDevolucoes(c, a),
  },
]

export const FERRAMENTAS_POR_NOME = new Map(FERRAMENTAS.map(f => [f.nome, f]))

/** Definicao no formato de funcoes (OpenAI/OpenRouter). */
export function definicaoParaModelo(f: FerramentaIA) {
  const esquema = zodToJsonSchema(f.parametros, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>
  delete esquema.$schema
  return { type: 'function' as const, function: { name: f.nome, description: f.descricao, parameters: esquema } }
}

/** Ferramentas que o contexto pode usar (a IA so "ve" o que o usuario pode executar). */
export function ferramentasDisponiveis(ctx: ContextoIA, area?: AreaFerramenta) {
  return FERRAMENTAS.filter(f => (!area || f.area === area) && permiteArea(ctx, f.area))
}

function permiteArea(ctx: ContextoIA, area: AreaFerramenta) {
  const p = ctx.permissoes
  if (!p.usarAssistenteIA) return false
  return area === 'operacoes' ? p.iaOperacional && p.verDesempenho : p.iaEstoque && p.verEstoque
}
