import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { FERRAMENTAS_POR_NOME } from './ferramentas'
import { motivoNegado } from './autorizacao'
import { ocultarSegredos, removerDadosPessoais } from './seguranca'
import { ErroFerramenta, type ContextoIA, type ResultadoFerramenta } from './tipos'

// Unico ponto por onde uma ferramenta roda (chat e MCP). Ordem fixa:
//   existe? -> argumentos validos? -> usuario autorizado? -> executa com timeout -> audita.
// A IA nunca autoriza nada: o contexto vem da sessao, e a negacao acontece aqui.

export type StatusExecucao = 'OK' | 'NEGADO' | 'INVALIDO' | 'ERRO'

export interface Execucao {
  ferramenta: string
  status: StatusExecucao
  resultado?: ResultadoFerramenta
  erro?: string
  duracaoMs: number
}

export const TIMEOUT_FERRAMENTA_MS = 15_000
const MAX_ARGS_BYTES = 2000

function nomeSeguro(nome: unknown) {
  return typeof nome === 'string' && /^[a-z_]{1,50}$/.test(nome) ? nome : '(invalida)'
}

async function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new ErroFerramenta('TIMEOUT', 'A consulta demorou demais e foi cancelada.')), ms) })
  try { return await Promise.race([p, limite]) } finally { if (t) clearTimeout(t) }
}

async function auditar(ctx: ContextoIA, e: Execucao, parametros: unknown) {
  try {
    await prisma.execucaoFerramentaIA.create({
      data: {
        conversaId: ctx.conversaId ?? null,
        usuarioId: ctx.usuarioId,
        origem: ctx.origem,
        ferramenta: e.ferramenta,
        parametros: parametros == null ? undefined : JSON.parse(ocultarSegredos(JSON.stringify(parametros).slice(0, 1500))),
        status: e.status,
        duracaoMs: e.duracaoMs,
        resumo: e.resultado ? ocultarSegredos(e.resultado.resumo).slice(0, 240) : null,
        erro: e.erro ? ocultarSegredos(e.erro).slice(0, 240) : null,
      },
    })
    if (e.status === 'NEGADO') {
      await registrarLog({
        usuarioId: ctx.usuarioId,
        acao: 'IA_FERRAMENTA_NEGADA',
        entidade: 'IA',
        detalhes: `Ferramenta ${e.ferramenta} negada (${ctx.origem}): ${(e.erro ?? '').slice(0, 120)}`,
      })
    }
  } catch (erro) {
    // Auditoria nunca derruba a consulta, mas a falha aparece no log do servidor (sem segredos).
    console.error('[IA] falha ao auditar execucao de ferramenta:', ocultarSegredos(String((erro as Error)?.message ?? erro)).slice(0, 200))
  }
}

export async function executarFerramenta(
  ctx: ContextoIA,
  nome: unknown,
  argumentos: unknown,
  opcoes: { timeoutMs?: number; /** Se informado, so estas ferramentas podem rodar (ex.: as da aba aberta). */ permitidas?: Set<string> } = {},
): Promise<Execucao> {
  const inicio = Date.now()
  const ferramenta = nomeSeguro(nome)
  const finalizar = async (status: StatusExecucao, extra: { resultado?: ResultadoFerramenta; erro?: string }, parametros?: unknown): Promise<Execucao> => {
    const e: Execucao = { ferramenta, status, duracaoMs: Date.now() - inicio, ...extra }
    await auditar(ctx, e, parametros)
    return e
  }

  const def = typeof nome === 'string' ? FERRAMENTAS_POR_NOME.get(nome) : undefined
  if (!def) return finalizar('INVALIDO', { erro: 'Ferramenta desconhecida.' })

  // Argumentos podem chegar como texto JSON (vindos do modelo) ou como objeto (MCP).
  let bruto: unknown = argumentos ?? {}
  if (typeof bruto === 'string') {
    if (bruto.length > MAX_ARGS_BYTES) return finalizar('INVALIDO', { erro: 'Argumentos grandes demais.' })
    try { bruto = bruto.trim() ? JSON.parse(bruto) : {} } catch { return finalizar('INVALIDO', { erro: 'Argumentos não são um JSON válido.' }) }
  }
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) return finalizar('INVALIDO', { erro: 'Os argumentos devem ser um objeto.' })
  if (JSON.stringify(bruto).length > MAX_ARGS_BYTES) return finalizar('INVALIDO', { erro: 'Argumentos grandes demais.' })

  const parsed = def.parametros.safeParse(bruto)
  if (!parsed.success) {
    const msg = parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.') || 'argumento'}: ${i.message}`).join('; ')
    return finalizar('INVALIDO', { erro: `Parâmetros inválidos (${msg}).` })
  }

  if (opcoes.permitidas && !opcoes.permitidas.has(def.nome)) {
    return finalizar('NEGADO', { erro: 'Esta ferramenta não está disponível nesta área.' }, parsed.data)
  }
  const negado = motivoNegado(ctx, def.area)
  if (negado) return finalizar('NEGADO', { erro: negado }, parsed.data)
  if (def.exige && !ctx.permissoes[def.exige]) return finalizar('NEGADO', { erro: 'Seu perfil não tem permissão para esta consulta.' }, parsed.data)

  try {
    const resultado = await comTimeout(def.executar(ctx, parsed.data), opcoes.timeoutMs ?? TIMEOUT_FERRAMENTA_MS)
    return finalizar('OK', { resultado }, parsed.data)
  } catch (erro) {
    if (erro instanceof ErroFerramenta) {
      const status: StatusExecucao = erro.codigo === 'NEGADO' ? 'NEGADO' : erro.codigo === 'INVALIDO' || erro.codigo === 'LIMITE' ? 'INVALIDO' : 'ERRO'
      return finalizar(status, { erro: erro.message }, parsed.data)
    }
    console.error(`[IA] erro na ferramenta ${ferramenta}:`, ocultarSegredos(String((erro as Error)?.message ?? erro)).slice(0, 300))
    return finalizar('ERRO', { erro: 'Não foi possível concluir a consulta agora.' }, parsed.data)
  }
}

/**
 * O que vai para o modelo: sem dados pessoais e com tamanho limitado. O resultado completo (com
 * referencias) fica so no servidor/tela.
 */
export function resultadoParaModelo(r: ResultadoFerramenta, maxChars = 10_000): string {
  const base = { resumo: r.resumo, indicadores: r.indicadores, avisos: r.avisos, fonte: r.fonte, truncado: r.truncado ?? false, dados: r.dados as unknown }
  let texto = removerDadosPessoais(JSON.stringify(base))
  if (texto.length > maxChars) {
    const reduzido = { ...base, dados: undefined, dadosTruncados: removerDadosPessoais(JSON.stringify(r.dados)).slice(0, Math.max(500, maxChars - 2500)), avisos: [...r.avisos, 'Dados cortados por tamanho; peça uma consulta mais específica.'] }
    texto = JSON.stringify(reduzido).slice(0, maxChars)
  }
  return texto
}
