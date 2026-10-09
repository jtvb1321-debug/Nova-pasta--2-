// IMPORTAR ESTE ARQUIVO PRIMEIRO em todo teste que toca o banco.
// Aponta o Prisma para o banco LOCAL e ISOLADO de testes e recusa qualquer outro.
import { urlBancoTeste } from '../../scripts/ia-banco-teste.mjs'

const { url, host, banco } = urlBancoTeste() // lanca se o host nao for local ou o banco nao for gts_orbia_ai_test*
process.env.DATABASE_URL = url
process.env.PRISMA_LOG_QUERIES = 'false'
process.env.ORBIA_AI_PROVIDER = 'mock'
process.env.ORBIA_AI_ENABLED = 'true'

export const BANCO_TESTE = { host, banco }
