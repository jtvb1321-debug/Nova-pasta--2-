const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const equipes = await prisma.equipe.findMany({ select: { id: true, nome: true } })
  console.log('Equipes cadastradas:')
  equipes.forEach(e => console.log(`- "${e.nome}" (id: ${e.id})`))
}

main().finally(async () => { await prisma.$disconnect() })