import './ambiente'
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { prisma } from '@/lib/prisma'
import { semear, type Dados } from './dados'
import { lerConfigIA } from '@/lib/ia/config'
import { criarServidorMcp, NOME_SERVIDOR_MCP } from '@/lib/ia/mcp/servidor'
import { zerarLimites } from '@/lib/ia/limites'
import type { ContextoIA } from '@/lib/ia/tipos'

let D: Dados
before(async () => { D = await semear() })
beforeEach(() => zerarLimites())
after(async () => { await prisma.$disconnect() })

// Liga um cliente MCP de verdade ao servidor, em memoria (nenhuma porta de rede).
async function conectar(ctx: ContextoIA, env: Record<string, string> = {}) {
  const servidor = criarServidorMcp({ ...ctx, origem: 'mcp' }, lerConfigIA({ ORBIA_AI_PROVIDER: 'mock', ...env }))
  const [cTransporte, sTransporte] = InMemoryTransport.createLinkedPair()
  const cliente = new Client({ name: 'cliente-de-teste', version: '1.0.0' })
  await Promise.all([servidor.connect(sTransporte), cliente.connect(cTransporte)])
  return { cliente, fechar: async () => { await cliente.close(); await servidor.close() } }
}
const texto = (r: any) => (r.content as { type: string; text: string }[]).map(c => c.text).join('\n')

describe('servidor MCP (stdio local, mesmas ferramentas e mesmo executor)', () => {
  it('anuncia nome e expoe as 21 ferramentas, todas marcadas como somente leitura', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('ADMIN'))
    try {
      assert.equal(cliente.getServerVersion()?.name, NOME_SERVIDOR_MCP)
      const { tools } = await cliente.listTools()
      assert.equal(tools.length, 21)
      for (const t of tools) {
        assert.equal(t.annotations?.readOnlyHint, true, t.name); assert.equal(t.annotations?.destructiveHint, false, t.name)
        assert.match(t.description ?? '', /somente leitura/)
        assert.equal((t.inputSchema as any).type, 'object')
      }
      assert.ok(!tools.some(t => /apagar|excluir|transferir|comprar|baixa|sql/i.test(t.name)))
    } finally { await fechar() }
  })
  it('executa uma ferramenta de verdade e audita com origem "mcp"', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('GESTOR'))
    try {
      const r = await cliente.callTool({ name: 'materiais_abaixo_minimo', arguments: { limite: 3 } })
      assert.ok(!r.isError)
      const j = JSON.parse(texto(r))
      assert.match(j.resumo, /abaixo do mínimo/); assert.ok(j.fonte.tabelas.includes('itens_estoque'))
      const a = (await prisma.execucaoFerramentaIA.findMany({ where: { origem: 'mcp', usuarioId: D.usuarios.gestor.id } })).at(-1)!
      assert.equal(a.ferramenta, 'materiais_abaixo_minimo'); assert.equal(a.status, 'OK')
    } finally { await fechar() }
  })
  it('resultado do MCP nao traz dados pessoais do cliente', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('ADMIN'))
    try {
      for (const [name, args] of [['chamados_criticos', {}], ['atendimentos_pendentes', {}], ['consultar_equipamento', { serial: 'AA:BB:CC:00:00:03' }]] as const) {
        const t = texto(await cliente.callTool({ name, arguments: args as any }))
        assert.doesNotMatch(t, /CLIENTE TESTE IA|99999|Rua Teste/, name)
        assert.ok(t.length > 100, name)
      }
    } finally { await fechar() }
  })
  it('argumentos invalidos viram erro (isError) e nao executam nada', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('ADMIN'))
    try {
      const antes = await prisma.execucaoFerramentaIA.count({ where: { origem: 'mcp', status: 'OK' } })
      const r = await cliente.callTool({ name: 'consultar_estoque', arguments: { limite: 9999 } }).catch(e => ({ isError: true, content: [{ type: 'text', text: String(e.message) }] }))
      assert.equal(r.isError, true)
      assert.equal(await prisma.execucaoFerramentaIA.count({ where: { origem: 'mcp', status: 'OK' } }), antes)
    } finally { await fechar() }
  })
  it('chave desconhecida nos argumentos e rejeitada (esquema estrito)', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('ADMIN'))
    try {
      const r: any = await cliente.callTool({ name: 'analisar_sla', arguments: { periodo: '30d', sql: 'DROP TABLE chamados' } }).catch(e => ({ isError: true, content: [{ type: 'text', text: String(e.message) }] }))
      assert.equal(r.isError, true)
      assert.equal(await prisma.chamado.count() > 0, true)
    } finally { await fechar() }
  })
  it('ferramenta fora das permissoes do usuario nem aparece e nao pode ser chamada', async () => {
    const ctx = D.ctxDe('GESTOR', { permissoes: { iaEstoque: false } })
    const { cliente, fechar } = await conectar(ctx)
    try {
      const { tools } = await cliente.listTools()
      assert.equal(tools.length, 13); assert.ok(tools.every(t => !/estoque|movimentacoes|equipamento|consumo|reposicao|devolucoes|materiais/.test(t.name)))
      const r: any = await cliente.callTool({ name: 'consultar_estoque', arguments: {} }).catch(e => ({ isError: true, content: [{ type: 'text', text: String(e.message) }] }))
      assert.equal(r.isError, true)
    } finally { await fechar() }
  })
  it('perfil sem acesso (operador/tecnico) nao tem nenhuma ferramenta', async () => {
    for (const papel of ['OPERADOR', 'TECNICO']) {
      const { cliente, fechar } = await conectar(D.ctxDe(papel))
      try {
        const lista = await cliente.listTools().then(r => r.tools.length).catch(() => 0)
        assert.equal(lista, 0, papel)
      } finally { await fechar() }
    }
  })
  it('escopo de equipe vale tambem no MCP', async () => {
    const ctx = D.ctxDe('ADMIN', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeA.id })
    const { cliente, fechar } = await conectar(ctx)
    try {
      const r: any = await cliente.callTool({ name: 'chamados_criticos', arguments: { equipeId: D.equipeB.id } })
      assert.equal(r.isError, true); assert.match(texto(r), /NEGADO/)
      const ok: any = await cliente.callTool({ name: 'chamados_criticos', arguments: {} })
      assert.ok(!ok.isError); assert.doesNotMatch(texto(ok), new RegExp(D.equipeB.nome.replace(/[()]/g, '.')))
    } finally { await fechar() }
  })
  it('desativado no ambiente: o MCP tambem recusa', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('ADMIN'), { ORBIA_AI_ENABLED: 'false' })
    try {
      const r: any = await cliente.callTool({ name: 'consultar_metas', arguments: {} })
      assert.equal(r.isError, true); assert.match(texto(r), /desativado/)
    } finally { await fechar() }
  })
  it('limite de uso tambem vale no MCP', async () => {
    const { cliente, fechar } = await conectar(D.ctxDe('ADMIN'), { ORBIA_AI_RATE_PER_MINUTE: '1' }) // MCP permite 4x o limite do chat
    try {
      let bloqueou = false
      for (let i = 0; i < 6; i++) {
        const r: any = await cliente.callTool({ name: 'consultar_metas', arguments: {} })
        if (r.isError && /Limite/.test(texto(r))) { bloqueou = true; break }
      }
      assert.equal(bloqueou, true)
    } finally { await fechar() }
  })
})
