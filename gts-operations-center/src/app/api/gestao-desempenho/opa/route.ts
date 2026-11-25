import { NextRequest, NextResponse } from 'next/server'
import { lerConfig } from '@/lib/gestaoDesempenho/config'
import { opaConfigurada } from '@/lib/gestaoDesempenho/opa/adaptador'
import { buscarUsuariosOpa, OpaErro } from '@/lib/gestaoDesempenho/opa/cliente'
import { presetOpaSuite } from '@/lib/gestaoDesempenho/opa/presetOpaSuite'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

// Apoio a configuracao do OPA (so ADMIN). Nada aqui grava no OPA: so consultas de leitura.

/** Mapeamento padrao do OPA Suite, conforme a documentacao publica da API (o administrador revisa e salva). */
export async function GET(req: NextRequest) {
  const a = await exigir('gdConfigurarIntegracoes')
  if (a.erro) return a.erro
  const quem = new URL(req.url).searchParams.get('usuarios')
  if (quem === null) return NextResponse.json({ preset: presetOpaSuite() }, { headers: { 'Cache-Control': 'no-store' } })

  // ?usuarios=Nome -> localiza usuarios/atendentes no OPA para descobrir o identificador de cada um.
  const nome = quem.trim()
  if (nome.length < 2) return NextResponse.json({ error: 'Digite ao menos 2 letras do nome.' }, { status: 400 })
  try {
    const cfg = await lerConfig('opa')
    const estado = opaConfigurada(cfg)
    if (!process.env.OPA_API_URL || !process.env.OPA_API_TOKEN) return NextResponse.json({ error: 'Defina OPA_API_URL e OPA_API_TOKEN nas variáveis de ambiente do servidor.' }, { status: 409 })
    if (!cfg.caminhoUsuarios) return NextResponse.json({ error: 'Informe o caminho da lista de usuários do OPA na configuração.' }, { status: 409 })
    void estado
    const usuarios = await buscarUsuariosOpa(cfg, { baseUrl: process.env.OPA_API_URL, token: process.env.OPA_API_TOKEN }, nome)
    await auditar(a.usuario, 'OPA_BUSCA_USUARIO', 'GdConfiguracao', 'opa', `busca por nome (${usuarios.length} resultado(s))`)
    return NextResponse.json({ usuarios }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof OpaErro) return NextResponse.json({ error: e.message }, { status: 502 })
    return tratarErro(e, 'opa usuarios')
  }
}
