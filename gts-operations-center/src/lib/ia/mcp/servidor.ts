import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { lerConfigIA, type ConfigIA } from '../config'
import { FERRAMENTAS, ferramentasDisponiveis } from '../ferramentas'
import { executarFerramenta, resultadoParaModelo } from '../executor'
import { consumirLimite } from '../limites'
import type { ContextoIA } from '../tipos'

// Servidor MCP do Orbia. Nao implementa regra de negocio: expoe as MESMAS ferramentas do assistente
// interno, passando pelo MESMO executor (validacao, permissao, escopo, auditoria).
//
// Somente transporte local (stdio, ver scripts/ia-mcp.ts). Nao ha endpoint HTTP/publico.
// O cliente MCP age sempre como um usuario real do sistema (ctx), com as permissoes dele.

export const NOME_SERVIDOR_MCP = 'orbia-inteligencia-operacional'
export const VERSAO_SERVIDOR_MCP = '1.0.0'

/** Texto devolvido ao cliente MCP: resultado ja sem dados pessoais e com tamanho limitado. */
function conteudoTexto(texto: string, erro = false) {
  return { content: [{ type: 'text' as const, text: texto }], ...(erro ? { isError: true } : {}) }
}

export function criarServidorMcp(ctx: ContextoIA, config: ConfigIA = lerConfigIA()): McpServer {
  const servidor = new McpServer({ name: NOME_SERVIDOR_MCP, version: VERSAO_SERVIDOR_MCP })

  // So registra o que este usuario pode usar: o cliente nem enxerga ferramentas fora do escopo.
  for (const f of ferramentasDisponiveis(ctx)) {
    servidor.registerTool(
      f.nome,
      { description: `${f.descricao} (somente leitura)`, inputSchema: f.parametros, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      async (args: unknown) => {
        if (!config.habilitado) return conteudoTexto('O assistente de IA está desativado neste ambiente.', true)
        const lim = consumirLimite(`mcp:${ctx.usuarioId}`, config.limitePorMinuto * 4, config.limitePorDia * 4)
        if (!lim.ok) return conteudoTexto(`Limite de consultas atingido. Tente em ${lim.tentarEmSegundos}s.`, true)
        const exec = await executarFerramenta(ctx, f.nome, args)
        if (exec.status !== 'OK' || !exec.resultado) return conteudoTexto(`${exec.status}: ${exec.erro ?? 'consulta não realizada'}`, true)
        return conteudoTexto(resultadoParaModelo(exec.resultado))
      },
    )
  }
  return servidor
}

export const TOTAL_FERRAMENTAS = FERRAMENTAS.length
