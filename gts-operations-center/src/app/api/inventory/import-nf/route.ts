import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { parseStringPromise } from 'xml2js'

interface ItemNota {
  codigoNF: string
  descricao: string
  quantidade: number
  valorUnitario: number
  unidade: string
}

function toArray(x: any) {
  if (!x) return []
  return Array.isArray(x) ? x : [x]
}

async function parseXmlNFe(conteudo: string): Promise<{ notaFiscal: string; itens: ItemNota[] }> {
  const resultado = await parseStringPromise(conteudo, { explicitArray: false, ignoreAttrs: false })

  // NF-e pode vir dentro de nfeProc ou direto em NFe, dependendo de como foi exportada
  const nfe = resultado.nfeProc?.NFe || resultado.NFe
  if (!nfe) throw new Error('Estrutura de XML nao reconhecida como NF-e')

  const infNFe = nfe.infNFe
  const notaFiscal = infNFe?.ide?.nNF || 'S/N'
  const detalhes = toArray(infNFe?.det)

  const itens: ItemNota[] = detalhes.map((det: any) => {
    const prod = det.prod
    return {
      codigoNF: String(prod.cProd),
      descricao: String(prod.xProd),
      quantidade: parseFloat(prod.qCom) || 0,
      valorUnitario: parseFloat(prod.vUnCom) || 0,
      unidade: String(prod.uCom || 'UN').toUpperCase(),
    }
  })

  return { notaFiscal: String(notaFiscal), itens }
}

function parseJsonNota(conteudo: string): { notaFiscal: string; itens: ItemNota[] } {
  const dados = JSON.parse(conteudo)
  const notaFiscal = String(dados.notaFiscal || dados.numero || 'S/N')
  const itensRaw = dados.itens || dados.produtos || []

  const itens: ItemNota[] = itensRaw.map((it: any) => ({
    codigoNF: String(it.codigo || it.cProd || it.sku),
    descricao: String(it.descricao || it.xProd || it.nome),
    quantidade: parseFloat(it.quantidade ?? it.qCom ?? 0),
    valorUnitario: parseFloat(it.valorUnitario ?? it.vUnCom ?? 0),
    unidade: String(it.unidade || it.uCom || 'UN').toUpperCase(),
  }))

  return { notaFiscal, itens }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('arquivo') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const conteudo = await file.text()
    const isXml = file.name.toLowerCase().endsWith('.xml') || conteudo.trim().startsWith('<')

    const { notaFiscal, itens } = isXml
      ? await parseXmlNFe(conteudo)
      : parseJsonNota(conteudo)

    if (itens.length === 0) {
      return NextResponse.json({ error: 'Nenhum item encontrado no arquivo' }, { status: 400 })
    }

    // Verifica quais itens ja existem no estoque, comparando pelo codigo
    const itensComStatus = await Promise.all(
      itens.map(async (item) => {
        const existente = await prisma.itemEstoque.findUnique({
          where: { codigo: item.codigoNF },
        })
        return {
          ...item,
          encontrado: !!existente,
          itemExistente: existente
            ? {
                codigo: existente.codigo,
                descricao: existente.descricao,
                categoria: existente.categoria,
                unidade: existente.unidade,
              }
            : null,
        }
      })
    )

    return NextResponse.json({ notaFiscal, itens: itensComStatus })
  } catch (error: any) {
    console.error('Erro ao importar nota fiscal:', error)
    return NextResponse.json({ error: error.message || 'Erro ao processar arquivo' }, { status: 500 })
  }
}