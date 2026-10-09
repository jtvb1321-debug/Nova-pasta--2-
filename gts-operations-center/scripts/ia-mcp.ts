// Servidor MCP LOCAL do Orbia (stdio). Nao abre porta nem endpoint de rede.
//
//   npm run ia:mcp
//
// Requisitos (o script recusa se faltar algum):
//  - ORBIA_MCP_USER_EMAIL: e-mail de um usuario ATIVO do sistema; o cliente MCP age com as permissoes dele;
//  - DATABASE_URL apontando para banco local (host localhost), a nao ser que
//    ORBIA_MCP_ALLOW_REMOTE_DB=true seja definido de forma explicita.
// Saida de log vai para stderr: stdout e' reservado ao protocolo MCP.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { prisma } from '../src/lib/prisma'
import { lerConfigIA } from '../src/lib/ia/config'
import { criarContexto } from '../src/lib/ia/autorizacao'
import { criarServidorMcp, TOTAL_FERRAMENTAS } from '../src/lib/ia/mcp/servidor'

const log = (...a: unknown[]) => console.error('[orbia-mcp]', ...a)

async function main() {
  const config = lerConfigIA()
  for (const aviso of config.avisos) log('aviso:', aviso)

  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* url invalida */ }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
  if (!local && process.env.ORBIA_MCP_ALLOW_REMOTE_DB !== 'true') {
    log(`Recusado: o banco (${host || 'desconhecido'}) nao e local. Defina ORBIA_MCP_ALLOW_REMOTE_DB=true apenas se tiver certeza.`)
    process.exit(2)
  }

  const email = process.env.ORBIA_MCP_USER_EMAIL?.trim().toLowerCase()
  if (!email) { log('Recusado: defina ORBIA_MCP_USER_EMAIL com o e-mail de um usuario ativo.'); process.exit(2) }
  const usuario = await prisma.usuario.findFirst({ where: { email, ativo: true }, select: { id: true, nome: true, role: true, funcionario: { select: { equipeId: true } } } })
  if (!usuario) { log('Recusado: usuario nao encontrado ou inativo.'); process.exit(2) }

  const ctx = criarContexto({ usuarioId: usuario.id, nome: usuario.nome, role: usuario.role, equipeId: usuario.funcionario?.equipeId ?? null, origem: 'mcp' })
  const servidor = criarServidorMcp(ctx, config)
  await servidor.connect(new StdioServerTransport())
  log(`Servidor MCP pronto (stdio) como ${usuario.role}; ferramentas liberadas para este usuario conforme permissoes (de ${TOTAL_FERRAMENTAS}).`)
}

main().catch(e => { console.error('[orbia-mcp] erro fatal:', String(e?.message ?? e).slice(0, 300)); process.exit(1) })
