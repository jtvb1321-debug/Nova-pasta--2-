// Recria os dados SINTETICOS no banco LOCAL ISOLADO (gts_orbia_ai_test) para testar a tela no navegador.
//   npm run test:ia:semear
// Usuarios de teste: admin@, gestor@, operador@ e tecnico@teste-ia.local (senha de teste em tests/ia/dados.ts).
import '../tests/ia/ambiente'
import { prisma } from '../src/lib/prisma'
import { semear, semearComercial, MARCA } from '../tests/ia/dados'

semear()
  .then(base => semearComercial(base))
  .then(async () => {
    console.log(`Dados sinteticos (${MARCA}) criados no banco de teste isolado.`)
    await prisma.$disconnect()
  })
  .catch(async e => {
    console.error('Falhou:', String(e?.message ?? e).slice(0, 300))
    await prisma.$disconnect()
    process.exit(1)
  })
