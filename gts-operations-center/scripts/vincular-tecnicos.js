const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const vinculos = [
    {
      email: 'Higor@gtsnet.com.br',
      nome: 'Higor',
      equipeId: 'equipe-03',
      veiculo: { placa: 'OPP3F19', modelo: 'Fiat Mobi' },
    },
    {
      email: 'Kaio@gtsnet.com.br',
      nome: 'Kaio Felipe',
      equipeId: 'equipe-04',
      veiculo: { placa: 'NIL8195', modelo: 'Celta' },
    },
  ]

  for (const v of vinculos) {
    console.log(`\n--- Processando ${v.nome} ---`)

    const usuario = await prisma.usuario.findFirst({ where: { email: { equals: v.email, mode: 'insensitive' } } })
    if (!usuario) {
      console.log(`ERRO: usuario nao encontrado para o email ${v.email}. Crie primeiro na tela de Usuarios (perfil Tecnico).`)
      continue
    }
    console.log(`Usuario encontrado: ${usuario.nome} (${usuario.email})`)

    const equipe = await prisma.equipe.findUnique({ where: { id: v.equipeId } })
    if (!equipe) {
      console.log(`ERRO: equipe nao encontrada com o id "${v.equipeId}".`)
      continue
    }
    console.log(`Equipe encontrada: ${equipe.nome}`)

    // Funcionario (vincula usuario a equipe)
    const funcionarioExistente = await prisma.funcionario.findUnique({ where: { usuarioId: usuario.id } })
    if (funcionarioExistente) {
      await prisma.funcionario.update({
        where: { id: funcionarioExistente.id },
        data: { equipeId: equipe.id, nome: v.nome },
      })
      console.log(`Funcionario ATUALIZADO: ${v.nome} -> equipe ${equipe.nome}`)
    } else {
      await prisma.funcionario.create({
        data: { nome: v.nome, equipeId: equipe.id, usuarioId: usuario.id },
      })
      console.log(`Funcionario CRIADO: ${v.nome} -> equipe ${equipe.nome}`)
    }

    // Veiculo (vincula a mesma equipe)
    const veiculoExistente = await prisma.veiculo.findUnique({ where: { placa: v.veiculo.placa } })
    if (veiculoExistente) {
      await prisma.veiculo.update({
        where: { id: veiculoExistente.id },
        data: { modelo: v.veiculo.modelo, equipeId: equipe.id },
      })
      console.log(`Veiculo ATUALIZADO: ${v.veiculo.placa} (${v.veiculo.modelo}) -> equipe ${equipe.nome}`)
    } else {
      await prisma.veiculo.create({
        data: { placa: v.veiculo.placa, modelo: v.veiculo.modelo, equipeId: equipe.id },
      })
      console.log(`Veiculo CRIADO: ${v.veiculo.placa} (${v.veiculo.modelo}) -> equipe ${equipe.nome}`)
    }
  }

  console.log('\nConcluido!')
}

main()
  .catch(e => { console.error('Erro geral:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })