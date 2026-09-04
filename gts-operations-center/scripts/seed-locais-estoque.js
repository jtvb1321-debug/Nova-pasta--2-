const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const LOCAIS = ['GTSNET', 'EACE', 'Ferramentas', 'Limpeza', 'ManINFO', 'ManINFO - Defeituosos']

const MAPA_CATEGORIA_LOCAL = {
  GTSNET: 'GTSNET',
  EACE: 'EACE',
  FERRAMENTAS: 'Ferramentas',
  LIMPEZA: 'Limpeza',
  MANINFO: 'ManINFO',
}

async function main() {
  console.log('--- Criando locais de estoque ---')
  const locaisCriados = {}
  for (const nome of LOCAIS) {
    const local = await prisma.localEstoque.upsert({
      where: { nome },
      update: {},
      create: { nome },
    })
    locaisCriados[nome] = local
    console.log(`Local OK: ${nome}`)
  }

  console.log('\n--- Populando saldos iniciais por local (baseado na categoria atual) ---')
  const itens = await prisma.itemEstoque.findMany()

  for (const item of itens) {
    const nomeLocal = MAPA_CATEGORIA_LOCAL[item.categoria]
    if (!nomeLocal) continue
    const local = locaisCriados[nomeLocal]

    const agregado = await prisma.estoqueEquipe.aggregate({
      where: { itemId: item.id },
      _sum: { quantidade: true },
    })
    const totalAlocadoEquipes = agregado._sum.quantidade ?? 0
    const disponivelCentral = Math.max(0, item.quantidadeAtual - totalAlocadoEquipes)

    if (disponivelCentral > 0) {
      await prisma.estoqueLocalCentral.upsert({
        where: { localId_itemId: { localId: local.id, itemId: item.id } },
        update: { quantidade: disponivelCentral },
        create: { localId: local.id, itemId: item.id, quantidade: disponivelCentral },
      })
      console.log(`${item.codigo} -> ${nomeLocal}: ${disponivelCentral} ${item.unidade}`)
    }
  }

  console.log('\nConcluido!')
}

main()
  .catch(e => { console.error('Erro:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })