const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function inicioDoMes(data) {
  return new Date(data.getFullYear(), data.getMonth(), 1)
}

async function main() {
  console.log('--- Migrando vendas Instaladas para Clientes ---')

  const vendas = await prisma.venda.findMany({
    where: {
      statusInstalacao: 'INSTALADA',
      clienteId: null,
    },
  })

  console.log(`Encontradas ${vendas.length} vendas instaladas sem cliente vinculado.`)

  let criados = 0

  for (const venda of vendas) {
    const dataAtivacao = venda.dataInstalacao || venda.data || new Date()

    const cliente = await prisma.cliente.create({
      data: {
        nome: venda.clienteNome,
        cpfCnpj: venda.clienteCpfCnpj,
        telefone: venda.telefone,
        endereco: venda.endereco,
        cidade: venda.cidade,
        bairro: venda.bairro,
        plano: venda.planoVendido,
        valorMensalidade: venda.valor,
        vendedorId: venda.vendedorId,
        dataAtivacao,
        status: 'ATIVO',
      },
    })

    await prisma.venda.update({ where: { id: venda.id }, data: { clienteId: cliente.id } })

    await prisma.contaReceber.upsert({
      where: { clienteId_competencia: { clienteId: cliente.id, competencia: inicioDoMes(dataAtivacao) } },
      update: {},
      create: {
        clienteId: cliente.id,
        competencia: inicioDoMes(dataAtivacao),
        valor: venda.valor,
      },
    })

    criados++
    console.log(`Cliente criado: ${cliente.nome} (venda ${venda.id})`)
  }

  console.log(`\nConcluido! ${criados} clientes migrados.`)
}

main()
  .catch(e => { console.error('Erro:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })