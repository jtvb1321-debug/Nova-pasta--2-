const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const prisma = new PrismaClient()

async function main() {
  const caminhoArquivo = path.join(__dirname, 'clientes_importar.json')
  if (!fs.existsSync(caminhoArquivo)) {
    console.error('Arquivo nao encontrado:', caminhoArquivo)
    process.exit(1)
  }

  const clientesImportar = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf-8'))
  console.log(`--- Importando ${clientesImportar.length} clientes do sistema antigo ---`)

  let criados = 0
  let ignorados = 0

  for (const c of clientesImportar) {
    const existente = await prisma.cliente.findFirst({
      where: { nome: { equals: c.nome, mode: 'insensitive' } },
    })

    if (existente) {
      ignorados++
      continue
    }

    let observacao = `Importado do sistema antigo (IXC) - Cod: ${c.codigoLegado}`
    if (c.saldoEmAberto > 0) {
      observacao += ` - Saldo em aberto na migracao: R$ ${c.saldoEmAberto.toFixed(2)}`
    }

    await prisma.cliente.create({
      data: {
        nome: c.nome,
        valorMensalidade: c.valorMensalidade,
        status: 'ATIVO',
        dataAtivacao: new Date(),
        observacao,
      },
    })

    criados++
    if (criados % 50 === 0) console.log(`${criados} clientes criados...`)
  }

  console.log(`\nConcluido!`)
  console.log(`Criados: ${criados}`)
  console.log(`Ignorados (ja existiam pelo nome): ${ignorados}`)
}

main()
  .catch(e => { console.error('Erro:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })