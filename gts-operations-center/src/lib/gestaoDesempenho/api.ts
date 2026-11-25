// Auxiliares das rotas /api/gestao-desempenho: autenticacao + permissao do modulo, periodo do filtro e erros padronizados.
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { auth } from '@/lib/auth'
import { temPermissao, type Permission } from '@/lib/permissions'
import { registrarLog } from '@/lib/auditLog'
import { PRESETS, resolverPeriodo, type Periodo, type PresetPeriodo } from './periodos'
import { lerConfig } from './config'
import { ErroRelatorio } from './relatorios'

export interface UsuarioGd { id: string; nome: string; role: string }

/** Sessao + permissao. Devolve o usuario ou a resposta de erro pronta (401/403). */
export async function exigir(permissao: keyof Permission): Promise<{ usuario: UsuarioGd; erro?: undefined } | { usuario?: undefined; erro: NextResponse }> {
  const session = await auth()
  if (!session) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  const u = session.user as any
  if (!temPermissao(u?.role, permissao)) return { erro: NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 }) }
  return { usuario: { id: u.id, nome: u.name || u.email || 'Usuário', role: u.role } }
}

/** Periodo a partir de ?preset=&inicio=&fim= (padrao: semana atual). null = invalido. */
export async function periodoDaRequisicao(params: URLSearchParams): Promise<Periodo | null> {
  const preset = (params.get('preset') ?? 'semana_atual') as PresetPeriodo
  if (!PRESETS.includes(preset)) return null
  const { inicioSemana } = await lerConfig('operacao')
  return resolverPeriodo(preset, { inicioSemana, inicio: params.get('inicio') ?? undefined, fim: params.get('fim') ?? undefined })
}

export const PERIODO_INVALIDO = () => NextResponse.json({ error: 'Período inválido. Use um filtro conhecido ou datas AAAA-MM-DD (início antes do fim).' }, { status: 400 })

export function auditar(u: UsuarioGd, acao: string, entidade: string, entidadeId: string | undefined, detalhes: string) {
  return registrarLog({ usuarioId: u.id, acao: `GD_${acao}`, entidade, entidadeId, detalhes: detalhes.slice(0, 300) })
}

/** Erros esperados viram 4xx com a mensagem; o resto e' 500 generico (detalhe so no log do servidor). */
export function tratarErro(e: unknown, contexto: string): NextResponse {
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message || 'Dados inválidos.' }, { status: 400 })
  if (e instanceof ErroRelatorio) return NextResponse.json({ error: e.message }, { status: e.codigo === 'NAO_ENCONTRADO' ? 404 : e.codigo === 'ESTADO_INVALIDO' ? 409 : 400 })
  console.error(`[GestaoDesempenho] ${contexto}:`, e instanceof Error ? e.message : e)
  return NextResponse.json({ error: 'Não foi possível concluir agora.' }, { status: 500 })
}
