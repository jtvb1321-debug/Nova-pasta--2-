// Prepara o banco LOCAL e ISOLADO usado pelos testes do assistente de IA.
//
// Regras de seguranca (o script recusa se alguma falhar):
//  - o host da conexao precisa ser localhost / 127.0.0.1 / ::1;
//  - o nome do banco precisa comecar com "gts_orbia_ai_test";
//  - a conexao nunca e impressa (so host e nome do banco).
//
// A URL vem de ORBIA_AI_TEST_DATABASE_URL ou e derivada da DATABASE_URL do .env.local
// (mesmo usuario/host do Postgres local, trocando so o nome do banco). O .env de producao
// nunca e lido.
//
// Uso:  node scripts/ia-banco-teste.mjs          (cria o banco, se preciso, e aplica o schema)
//       node scripts/ia-banco-teste.mjs --url    (so valida e imprime host/banco)
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOME_BANCO = 'gts_orbia_ai_test'
const LOCAIS = ['localhost', '127.0.0.1', '::1', '[::1]']

function lerEnv(arquivo, chave) {
  if (!fs.existsSync(arquivo)) return null
  const m = fs.readFileSync(arquivo, 'utf8').match(new RegExp(`^${chave}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

export function urlBancoTeste() {
  const direta = process.env.ORBIA_AI_TEST_DATABASE_URL
  const base = direta || lerEnv(path.join(raiz, '.env.local'), 'DATABASE_URL')
  if (!base) throw new Error('Defina ORBIA_AI_TEST_DATABASE_URL ou crie o .env.local com o Postgres local.')
  const u = new URL(base)
  if (!direta) u.pathname = `/${NOME_BANCO}`
  for (const k of ['schema', 'connection_limit', 'pgbouncer', 'pool_timeout', 'connect_timeout']) u.searchParams.delete(k)
  const banco = u.pathname.replace(/^\//, '')
  if (!LOCAIS.includes(u.hostname)) throw new Error(`Recusado: o host "${u.hostname}" nao e local.`)
  if (!banco.startsWith(NOME_BANCO)) throw new Error(`Recusado: o banco "${banco}" nao comeca com ${NOME_BANCO}.`)
  return { url: u.toString(), host: u.hostname, banco }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url, host, banco } = urlBancoTeste()
  console.log(`Banco de teste isolado: ${banco} em ${host}`)
  if (process.argv.includes('--url')) process.exit(0)
  const r = spawnSync(process.execPath, [path.join(raiz, 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  })
  const saida = `${r.stdout || ''}${r.stderr || ''}`.replace(/postgres(ql)?:\/\/\S+/g, '[conexao]')
  console.log(saida.split('\n').filter(l => /sync|created|database|Error|erro|already|schema/i.test(l)).slice(0, 8).join('\n'))
  process.exit(r.status ?? 1)
}
