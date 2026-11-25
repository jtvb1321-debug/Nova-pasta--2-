import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { DIAS_OPERACAO_PADRAO } from './metas'
import { PONTUACAO_PADRAO, type ConfigPontuacao } from './pontuacao'

// Configuracoes do modulo (tabela gd_configuracoes). Tudo configuravel pelo administrador; os padroes abaixo
// so valem enquanto nada foi salvo.

import { TIPOS_NOTIFICACAO, ROTULO_NOTIFICACAO, type TipoNotificacao } from './tiposNotificacao'
export { TIPOS_NOTIFICACAO, ROTULO_NOTIFICACAO, type TipoNotificacao }

const operacao = z.object({
  /** 0 = domingo ... 6 = sabado. */
  diasOperacao: z.array(z.number().int().min(0).max(6)).min(1).default(DIAS_OPERACAO_PADRAO),
  /** Primeiro dia da semana dos relatorios semanais (padrao segunda-feira). */
  inicioSemana: z.number().int().min(0).max(6).default(1),
})

const sincronizacao = z.object({
  intervaloMinutos: z.number().int().min(5).max(240).default(15),
  /** Hora (America/Fortaleza) do fechamento diario automatico. */
  horaFechamento: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('20:00'),
  /** Quantos dias para tras cada rodada reprocessa (SLA e avaliacoes chegam depois do dia). */
  janelaReprocessoDias: z.number().int().min(1).max(60).default(7),
  opaAtiva: z.boolean().default(false),
})

const notificacoes = z.object({
  /** Tipos ligados (todos por padrao). */
  ativas: z.array(z.enum(TIPOS_NOTIFICACAO)).default([...TIPOS_NOTIFICACAO]),
  limiteSlaPct: z.number().min(0).max(100).default(80),
  limitePendencias: z.number().int().min(1).default(10),
  /** Aumento (em pontos percentuais) da taxa de rechamadas vs. periodo anterior que dispara o aviso. */
  aumentoRechamadasPp: z.number().min(0).default(5),
})

const pontuacao = z.object({
  ativa: z.boolean().default(false),
  aprovadaPor: z.string().nullable().default(null),
  aprovadaEm: z.string().nullable().default(null),
  pesos: z.record(z.string(), z.number().min(0)).default({}),
})

/**
 * Mapeamento da API do OPA (SEM valores padrao inventados): so passa a valer o que o administrador preencher a partir da
 * documentacao real. O TOKEN nunca fica aqui: apenas na variavel de ambiente OPA_API_TOKEN (e a URL base em OPA_API_URL).
 */
const caminho = z.string().trim().max(120).nullable().default(null)
const opa = z.object({
  /** Caminho (apos a URL base) que lista atendimentos por periodo, exatamente como na documentacao. */
  caminhoLista: z.string().trim().max(200).nullable().default(null),
  /** Nome do cabecalho de autenticacao e prefixo do valor (ex.: Authorization / Bearer ). Conforme a documentacao. */
  cabecalhoAuth: z.string().trim().max(60).nullable().default(null),
  prefixoAuth: z.string().max(30).default(''),
  /** Nomes dos parametros de consulta (periodo e paginacao) como na documentacao. */
  paramInicio: z.string().trim().max(40).nullable().default(null),
  paramFim: z.string().trim().max(40).nullable().default(null),
  paramPagina: z.string().trim().max(40).nullable().default(null),
  paramLimite: z.string().trim().max(40).nullable().default(null),
  tamanhoPagina: z.number().int().min(10).max(500).default(100),
  /** Onde seguem os filtros: na URL (QUERY) ou num corpo JSON { filter, options } (CORPO), como faz o OPA Suite. */
  estilo: z.enum(['QUERY', 'CORPO']).default('QUERY'),
  /** Paginacao: numero da pagina (PAGINA) ou deslocamento de registros (SKIP, ex.: options.skip do OPA Suite). */
  paginacao: z.enum(['PAGINA', 'SKIP']).default('PAGINA'),
  /** 2o par de datas: atendimentos ENCERRADOS no periodo (abertos antes). Resultado e' unido ao 1o sem duplicar. */
  paramInicioAlt: z.string().trim().max(40).nullable().default(null),
  paramFimAlt: z.string().trim().max(40).nullable().default(null),
  /** Filtro de situacao; com "buscarEmAberto" tambem traz o que segue em andamento (abertos antes do periodo). */
  paramStatus: z.string().trim().max(40).nullable().default(null),
  buscarEmAberto: z.boolean().default(false),
  /** Caminho da lista de usuarios/atendentes (so para localizar o identificador de cada atendente). */
  caminhoUsuarios: z.string().trim().max(200).nullable().default(null),
  /** Formato das datas no parametro de periodo: ISO completo ou so a data. */
  formatoParamData: z.enum(['ISO', 'DATA']).default('ISO'),
  /** Onde fica a lista dentro da resposta (ex.: data.items). Vazio = a propria resposta e' a lista. */
  caminhoItens: caminho,
  /** Campo (caminho no JSON do atendimento) de cada dado. So o que for informado conta como disponivel. */
  campos: z.object({
    id: caminho, atendenteId: caminho, protocolo: caminho, criadoEm: caminho, assumidoEm: caminho, primeiraRespostaEm: caminho,
    finalizadoEm: caminho, situacao: caminho, transferido: caminho, dentroSla: caminho, resolvidoRemoto: caminho, nota: caminho,
  }).default({}),
  /** Valores do campo de situacao que significam cada etapa (comparacao sem diferenciar maiusculas). */
  situacoes: z.object({
    finalizado: z.array(z.string()).default([]), abandonado: z.array(z.string()).default([]),
    emAtendimento: z.array(z.string()).default([]), aberto: z.array(z.string()).default([]),
  }).default({}),
})

export const SCHEMAS_CONFIG = { operacao, sincronizacao, notificacoes, pontuacao, opa } as const
export type ConfigOpa = z.infer<typeof opa>
export type ChaveConfig = keyof typeof SCHEMAS_CONFIG
export type ConfigOperacao = z.infer<typeof operacao>
export type ConfigSincronizacao = z.infer<typeof sincronizacao>
export type ConfigNotificacoes = z.infer<typeof notificacoes>

export async function lerConfig<K extends ChaveConfig>(chave: K): Promise<z.infer<(typeof SCHEMAS_CONFIG)[K]>> {
  const linha = await prisma.gdConfiguracao.findUnique({ where: { chave } })
  const r = (SCHEMAS_CONFIG[chave] as z.ZodTypeAny).safeParse(linha?.valor ?? {})
  return (r.success ? r.data : (SCHEMAS_CONFIG[chave] as z.ZodTypeAny).parse({})) as z.infer<(typeof SCHEMAS_CONFIG)[K]>
}

export async function gravarConfig<K extends ChaveConfig>(chave: K, valor: unknown, usuario: string) {
  const dados = (SCHEMAS_CONFIG[chave] as z.ZodTypeAny).parse(valor)
  await prisma.gdConfiguracao.upsert({
    where: { chave },
    create: { chave, valor: dados, updatedBy: usuario },
    update: { valor: dados, updatedBy: usuario },
  })
  return dados as z.infer<(typeof SCHEMAS_CONFIG)[K]>
}

export const lerPontuacao = async (): Promise<ConfigPontuacao> => ({ ...PONTUACAO_PADRAO, ...(await lerConfig('pontuacao')) })
