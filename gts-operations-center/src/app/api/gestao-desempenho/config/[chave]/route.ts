import { NextRequest, NextResponse } from 'next/server'
import { gravarConfig, lerConfig, SCHEMAS_CONFIG, type ChaveConfig } from '@/lib/gestaoDesempenho/config'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'
import { opaConfigurada } from '@/lib/gestaoDesempenho/opa/adaptador'

// Configuracoes do modulo. Integracao (OPA): so ADMIN. O TOKEN nunca passa por aqui nem e' devolvido (fica em OPA_API_TOKEN).
const valida = (c: string): c is ChaveConfig => c in SCHEMAS_CONFIG

export async function GET(_: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  if (!valida(chave)) return NextResponse.json({ error: 'Configuração desconhecida.' }, { status: 404 })
  const a = await exigir(chave === 'opa' ? 'gdConfigurarIntegracoes' : 'gdVerIndicadores')
  if (a.erro) return a.erro
  const valor = await lerConfig(chave)
  if (chave === 'opa') {
    const estado = opaConfigurada(valor as any)
    return NextResponse.json({ valor, ambiente: { urlConfigurada: !!process.env.OPA_API_URL, tokenConfigurado: !!process.env.OPA_API_TOKEN }, configurada: estado.ok, faltando: estado.faltando }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ valor }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  if (!valida(chave)) return NextResponse.json({ error: 'Configuração desconhecida.' }, { status: 404 })
  const a = await exigir(chave === 'opa' ? 'gdConfigurarIntegracoes' : 'gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    let corpo = await req.json().catch(() => null)
    // A pontuacao so conta depois que o gestor aprova os criterios: a aprovacao e' carimbada pelo servidor.
    if (chave === 'pontuacao' && corpo?.ativa) corpo = { ...corpo, aprovadaPor: a.usuario.nome, aprovadaEm: new Date().toISOString() }
    if (chave === 'pontuacao' && !corpo?.ativa) corpo = { ...corpo, ativa: false, aprovadaPor: null, aprovadaEm: null }
    const valor = await gravarConfig(chave, corpo, a.usuario.nome)
    await auditar(a.usuario, 'CONFIG_ALTERADA', 'GdConfiguracao', chave, chave === 'opa' ? 'mapeamento do OPA atualizado' : JSON.stringify(valor).slice(0, 200))
    return NextResponse.json({ valor })
  } catch (e) {
    return tratarErro(e, 'config PUT')
  }
}
