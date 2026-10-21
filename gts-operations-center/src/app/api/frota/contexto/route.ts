import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { filtroViaturas, naoEncontrada, PLACA_NA_URL, usuarioFrota } from '@/lib/frota/acesso'
import { configuracaoVigente } from '@/lib/frota/servico'
import { normalizarPlaca } from '@/lib/frota/regras'

// Tudo que a tela de vistoria precisa de uma vez: a viatura (pela placa do link), os itens exigidos agrupados por categoria
// e as fotos obrigatorias. So devolve viatura que o usuario pode vistoriar.
export async function GET(request: NextRequest) {
  const a = await usuarioFrota('vistoriar')
  if ('resposta' in a) return a.resposta
  const placa = normalizarPlaca(request.nextUrl.searchParams.get('placa') ?? '')
  if (!PLACA_NA_URL.test(placa)) return naoEncontrada()
  const v = await prisma.veiculo.findFirst({
    where: { AND: [await filtroViaturas(a.usuario), { placa }] },
    select: { id: true, placa: true, marca: true, modelo: true, cidadeBase: true, uf: true, kmAtual: true },
  })
  if (!v) return naoEncontrada()
  const config = await configuracaoVigente()
  const categorias: { nome: string; itens: { id: string; nome: string; quantidade: number | null }[] }[] = []
  for (const i of config.itens) {
    let c = categorias.find(x => x.nome === i.categoria)
    if (!c) { c = { nome: i.categoria, itens: [] }; categorias.push(c) }
    c.itens.push({ id: i.id, nome: i.nome, quantidade: i.quantidade })
  }
  return NextResponse.json({ viatura: v, categorias, fotosObrigatorias: config.fotosObrigatorias, vistoriador: a.usuario.nome }, { headers: { 'Cache-Control': 'no-store' } })
}
