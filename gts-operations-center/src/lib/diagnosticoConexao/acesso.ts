import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { registrarLog } from '@/lib/auditLog'
import { getPermissions } from '@/lib/permissions'
import { consumirLimite } from '@/lib/ia/limites'
import { resolverVinculoIxc } from '@/lib/ixcChamado'
import { ErroDiagnostico } from './tipos'

// Porta de entrada das rotas /api/diagnostico-conexao/*: sessao, permissao, limite de uso e erros padronizados.

export interface UsuarioDiagnostico { id: string; nome: string; role: string; /** Perfil com a busca livre de clientes (tecnico so consulta pelo chamado). */ buscaLivre: boolean }

const STATUS: Record<ErroDiagnostico['codigo'], number> = { INVALIDO: 400, NAO_ENCONTRADO: 404, IXC_INDISPONIVEL: 502, IXC_NAO_CONFIGURADO: 503 }

export async function usuarioAutorizado(): Promise<{ usuario: UsuarioDiagnostico } | { resposta: NextResponse }> {
  const session = await auth()
  const u = session?.user as { id?: string; name?: string | null; role?: string } | undefined
  if (!u?.id || !u.role) return { resposta: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) }
  const p = getPermissions(u.role)
  if (!p.verDiagnosticoConexao && !p.diagnosticoPeloChamado) return { resposta: NextResponse.json({ error: 'Sem permissao para o Diagnóstico de Conexão.' }, { status: 403 }) }
  return { usuario: { id: u.id, nome: u.name ?? 'Usuário', role: u.role, buscaLivre: p.verDiagnosticoConexao } }
}

export function respostaDeErro(erro: unknown) {
  if (erro instanceof ErroDiagnostico) return NextResponse.json({ error: erro.message, codigo: erro.codigo }, { status: STATUS[erro.codigo] })
  console.error('[diagnostico-conexao] erro inesperado:', String((erro as Error)?.message ?? erro).slice(0, 200))
  return NextResponse.json({ error: 'Não foi possível concluir a consulta agora.' }, { status: 500 })
}

/** Limite de consultas por usuario (cada consulta pode fazer varias chamadas ao IXC). */
export function limiteExcedido(usuarioId: string) {
  const l = consumirLimite(`dc:${usuarioId}`, 20, 400)
  return l.ok ? null : NextResponse.json({ error: 'Muitas consultas em pouco tempo. Aguarde um instante.' }, { status: 429, headers: { 'Retry-After': String(l.tentarEmSegundos ?? 30) } })
}

export async function auditar(usuario: UsuarioDiagnostico, acao: 'DIAGNOSTICO_CONEXAO_CONSULTA' | 'DIAGNOSTICO_CONEXAO_PDF' | 'DIAGNOSTICO_CONEXAO_BUSCA', entidadeId: string, detalhes: string, request: Request) {
  // Nunca grava login, IP ou nome: so codigo do cliente, contrato e periodo.
  await registrarLog({ usuarioId: usuario.id, acao, entidade: 'Cliente IXC', entidadeId, detalhes, request })
}

export const MSG_SO_PELO_CHAMADO = 'Esta consulta é feita a partir de um chamado: abra o diagnóstico pelo chamado do cliente.'

/**
 * Cliente da consulta. Com ?chamado=, vale SEMPRE o cliente do chamado (a regra e' a mesma da ficha do IXC no chamado:
 * tecnico so a propria equipe) e o codigo informado e' ignorado. Sem chamado, so quem tem a busca livre pode informar o codigo.
 */
export async function clienteDaConsulta(usuario: UsuarioDiagnostico, chamado: string | null, cliente: string | null): Promise<{ codigo: string; chamado: string | null } | { resposta: NextResponse }> {
  if (chamado) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(chamado)) return { resposta: NextResponse.json({ error: 'Chamado inválido.' }, { status: 400 }) }
    const v = await resolverVinculoIxc(chamado, usuario.role, usuario.id)
    if (v.tipo === 'resposta') {
      // Chamado sem cliente no IXC (EACE, sem vinculo) volta 200 com mensagem: aqui vira erro claro.
      if (v.resposta.status !== 200) return { resposta: v.resposta }
      const corpo = await v.resposta.clone().json().catch(() => ({} as any))
      return { resposta: NextResponse.json({ error: corpo?.mensagem ?? 'Este chamado não está vinculado a um cliente do IXC.' }, { status: 404 }) }
    }
    return { codigo: v.codigoIxc, chamado }
  }
  if (!usuario.buscaLivre) return { resposta: NextResponse.json({ error: MSG_SO_PELO_CHAMADO }, { status: 403 }) }
  return { codigo: cliente ?? '', chamado: null }
}
