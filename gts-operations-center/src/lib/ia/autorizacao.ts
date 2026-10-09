import { getPermissions } from '@/lib/permissions'
import { ErroFerramenta, type AreaFerramenta, type ContextoIA, type OrigemChamada, type PermissoesIA } from './tipos'

// Autorizacao do assistente. A IA NUNCA decide quem pode o que: cada ferramenta passa por aqui
// antes de tocar no banco, com o contexto montado no servidor a partir da sessao.

export function permissoesDoPapel(role: string): PermissoesIA {
  const p = getPermissions(role)
  return {
    usarAssistenteIA: p.usarAssistenteIA,
    iaOperacional: p.iaOperacional,
    iaEstoque: p.iaEstoque,
    verDesempenho: p.verDesempenho,
    verEstoque: p.verEstoque,
    apenasMinhaEquipe: p.apenasMinhaEquipe,
  }
}

export function criarContexto(dados: {
  usuarioId: string
  nome?: string | null
  role: string
  equipeId?: string | null
  origem: OrigemChamada
  conversaId?: string | null
  ip?: string | null
  /** So para testes: sobrescreve permissoes do papel. */
  permissoes?: Partial<PermissoesIA>
}): ContextoIA {
  const permissoes = { ...permissoesDoPapel(dados.role), ...dados.permissoes }
  return {
    usuarioId: dados.usuarioId,
    nome: dados.nome ?? null,
    role: dados.role,
    permissoes,
    // Quem so pode ver a propria equipe fica preso a ela; se nao ha equipe, nao ve nada.
    escopoEquipeId: permissoes.apenasMinhaEquipe ? (dados.equipeId ?? '__sem_equipe__') : null,
    origem: dados.origem,
    conversaId: dados.conversaId ?? null,
    ip: dados.ip ?? null,
  }
}

/** Texto do motivo de negacao ou null quando a area esta liberada. */
export function motivoNegado(ctx: ContextoIA, area: AreaFerramenta): string | null {
  const p = ctx.permissoes
  if (!p.usarAssistenteIA) return 'Seu perfil não tem acesso ao assistente de IA.'
  if (area === 'operacoes' && !(p.iaOperacional && p.verDesempenho)) return 'Seu perfil não tem permissão para consultas operacionais.'
  if (area === 'estoque' && !(p.iaEstoque && p.verEstoque)) return 'Seu perfil não tem permissão para consultas de estoque.'
  return null
}

export function exigirArea(ctx: ContextoIA, area: AreaFerramenta) {
  const motivo = motivoNegado(ctx, area)
  if (motivo) throw new ErroFerramenta('NEGADO', motivo)
}

/**
 * Equipe efetiva da consulta. Quem tem escopo de equipe so enxerga a propria; pedir outra e' negado
 * (e nao "corrigido em silencio"), para a tentativa ficar registrada.
 */
export function equipeEfetiva(ctx: ContextoIA, solicitada?: string | null): string | undefined {
  if (ctx.escopoEquipeId) {
    if (solicitada && solicitada !== ctx.escopoEquipeId) {
      throw new ErroFerramenta('NEGADO', 'Você só pode consultar dados da sua própria equipe.')
    }
    return ctx.escopoEquipeId
  }
  return solicitada || undefined
}

/** Consultas do estoque geral (todas as equipes) nao sao liberadas a quem tem escopo de equipe. */
export function exigirSemEscopoDeEquipe(ctx: ContextoIA) {
  if (ctx.escopoEquipeId) throw new ErroFerramenta('NEGADO', 'Esta consulta mostra o estoque geral e exige acesso a todas as equipes.')
}
