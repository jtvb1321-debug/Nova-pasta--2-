import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { prisma } from '@/lib/prisma'
import { semear } from './dados'

// Executa o script REAL (scripts/ia-mcp.ts) como o cliente MCP de um usuario faria: por stdio.
const raiz = path.resolve(__dirname, '../..')
const script = path.join(raiz, 'scripts/ia-mcp.ts')
const baseEnv = { ...process.env, PRISMA_LOG_QUERIES: 'false', ORBIA_AI_PROVIDER: 'mock' } as NodeJS.ProcessEnv

before(async () => { await semear() })
after(async () => { await prisma.$disconnect() })

const rodarRecusa = (env: Record<string, string>) =>
  spawnSync(process.execPath, ['--import', 'tsx', script], { cwd: raiz, env: { ...baseEnv, ...env } as NodeJS.ProcessEnv, encoding: 'utf8', timeout: 60_000 })

describe('script ia-mcp (stdio local)', () => {
  it('conecta como um usuario real do sistema e lista so o que o perfil permite', async () => {
    const transporte = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', script], cwd: raiz, env: { ...baseEnv, ORBIA_MCP_USER_EMAIL: 'gestor@teste-ia.local' }, stderr: 'pipe' })
    const cliente = new Client({ name: 'teste-stdio', version: '1.0.0' })
    try {
      await cliente.connect(transporte)
      const { tools } = await cliente.listTools()
      assert.equal(tools.length, 16)
      const r: any = await cliente.callTool({ name: 'consultar_metas', arguments: {} })
      assert.ok(!r.isError); assert.match(r.content[0].text, /Metas de SLA/)
      assert.ok((await prisma.execucaoFerramentaIA.findMany({ where: { origem: 'mcp', ferramenta: 'consultar_metas' } })).length >= 1)
    } finally { await cliente.close() }
  })
  it('operador (sem acesso ao assistente) conecta mas nao tem ferramentas', async () => {
    const transporte = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', script], cwd: raiz, env: { ...baseEnv, ORBIA_MCP_USER_EMAIL: 'operador@teste-ia.local' }, stderr: 'pipe' })
    const cliente = new Client({ name: 'teste-stdio', version: '1.0.0' })
    try {
      await cliente.connect(transporte)
      assert.equal(await cliente.listTools().then(r => r.tools.length).catch(() => 0), 0)
    } finally { await cliente.close() }
  })
  it('recusa sem ORBIA_MCP_USER_EMAIL', () => {
    const r = rodarRecusa({ ORBIA_MCP_USER_EMAIL: '' })
    assert.equal(r.status, 2); assert.match(r.stderr, /ORBIA_MCP_USER_EMAIL/)
  })
  it('recusa usuario inexistente', () => {
    const r = rodarRecusa({ ORBIA_MCP_USER_EMAIL: 'ninguem@teste-ia.local' })
    assert.equal(r.status, 2); assert.match(r.stderr, /nao encontrado ou inativo/)
  })
  it('recusa banco que nao e local (nao conecta nele) a menos que liberado de forma explicita', () => {
    const r = rodarRecusa({ DATABASE_URL: 'postgresql://usuario:senha@db.exemplo-remoto.supabase.co:5432/postgres', ORBIA_MCP_USER_EMAIL: 'gestor@teste-ia.local' })
    assert.equal(r.status, 2); assert.match(r.stderr, /nao e local/)
    assert.doesNotMatch(r.stderr + r.stdout, /senha@|usuario:senha/, 'a URL nao pode aparecer no log')
  })
  it('avisa que MCP publico e leitura-escrita sao ignorados', () => {
    const r = rodarRecusa({ ORBIA_MCP_USER_EMAIL: '', ORBIA_MCP_PUBLIC_ENABLED: 'true', ORBIA_AI_READ_ONLY: 'false' })
    assert.match(r.stderr, /MCP_PUBLIC_ENABLED=true ignorado/); assert.match(r.stderr, /READ_ONLY=false ignorado/)
  })
})
