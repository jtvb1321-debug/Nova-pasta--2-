// SONDA DE ESQUEMA DO IXC (somente leitura). Descobre quais tabelas respondem na API e quais CAMPOS cada uma tem,
// com a taxa de preenchimento numa amostra. NAO imprime valores de campos (nome, login, IP, MAC, senha...):
// so nomes de campos, contagens e, para campos de codigo curto (<= 6 valores distintos, ate 4 caracteres, ex.: S/N/A/CM),
// os codigos. Nenhuma escrita.
//
//   node scripts/ixc-sonda-esquema.mjs [arquivo-de-saida.json] [--env caminho/.env]
// Le IXC_API_URL e IXC_API_TOKEN do .env informado (ou do ambiente). Nunca imprime o token.
import fs from 'node:fs'

const args = process.argv.slice(2)
const iEnv = args.indexOf('--env')
const envFile = iEnv >= 0 ? args[iEnv + 1] : null
const saida = args.find((a, i) => !a.startsWith('--') && (iEnv < 0 || (i !== iEnv && i !== iEnv + 1)))

function lerEnv(chave) {
  if (process.env[chave]) return process.env[chave]
  if (!envFile || !fs.existsSync(envFile)) return null
  const m = fs.readFileSync(envFile, 'utf8').match(new RegExp(`^\\s*${chave}\\s*=\\s*(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const URL_API = lerEnv('IXC_API_URL')
const TOKEN = lerEnv('IXC_API_TOKEN')
if (!URL_API || !TOKEN) { console.error('Defina IXC_API_URL e IXC_API_TOKEN (ambiente ou --env).'); process.exit(1) }

const AUTH = `Basic ${Buffer.from(TOKEN).toString('base64')}`

async function consultar(tabela, rp = 60, ordenarPor = 'id') {
  const r = await fetch(`${URL_API.replace(/\/$/, '')}/${tabela}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH, ixcsoft: 'listar' },
    body: JSON.stringify({ qtype: `${tabela}.id`, query: '0', oper: '>', page: '1', rp: String(rp), sortname: `${tabela}.${ordenarPor}`, sortorder: 'desc' }),
  })
  const texto = await r.text()
  let json = null
  try { json = JSON.parse(texto) } catch { /* nao e json */ }
  return { status: r.status, json, texto: texto.slice(0, 160) }
}

// Tabelas candidatas: as que o codigo ja usa + nomes comuns do IXC para rede/OLT/FTTH/OS. Nao existir e' resultado valido.
const TABELAS = [
  'radusuarios', 'radpop_radio_cliente_fibra', 'rad_caixa_ftth', 'radpop', 'radpop_radio', 'radpop_radio_cliente', 'radacct', 'radgrupos',
  'cliente_contrato', 'cliente', 'vd_contratos', 'su_oss_chamado', 'su_ticket', 'cidade', 'radpop_estrutura', 'radpop_radio_porta',
  'radpop_radio_porta_pon', 'rad_porta_pon', 'radpop_radio_cliente_fibra_historico', 'radusuarios_historico', 'rad_historico_conexao',
  'radpop_radio_cliente_fibra_log', 'fn_areceber', 'cliente_arquivos', 'su_diagnostico', 'su_oss_assunto', 'cliente_contrato_produtos',
  'ftth_olt', 'olt', 'equipamento', 'patrimonio', 'su_oss_chamado_historico', 'radius_log', 'rad_log', 'radpop_ssid',
]

const saidaJson = { geradoEm: new Date().toISOString(), tabelas: {} }
const vazio = v => v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '0' || /^0000-00-00/.test(String(v).trim())

for (const tabela of TABELAS) {
  let r
  try { r = await consultar(tabela) } catch (e) { saidaJson.tabelas[tabela] = { responde: false, motivo: 'falha de rede' }; console.log(`✖ ${tabela}: falha de rede`); continue }
  const regs = r.json?.registros
  if (!r.json || !Array.isArray(regs)) {
    saidaJson.tabelas[tabela] = { responde: false, status: r.status, motivo: String(r.json?.message ?? r.json?.error ?? r.texto).slice(0, 120) }
    console.log(`✖ ${tabela}: nao responde (${r.status}) ${String(r.json?.message ?? '').slice(0, 80)}`)
    continue
  }
  const total = Number(r.json.total ?? regs.length)
  const campos = {}
  if (regs.length) {
    for (const campo of Object.keys(regs[0])) {
      const valores = regs.map(x => x[campo])
      const preenchidos = valores.filter(v => !vazio(v))
      const distintos = [...new Set(preenchidos.map(String))]
      const ehCodigo = distintos.length > 0 && distintos.length <= 6 && distintos.every(v => v.length <= 4)
      campos[campo] = { preenchido: Math.round((preenchidos.length / regs.length) * 100), ...(ehCodigo ? { codigos: distintos.sort() } : {}) }
    }
  }
  saidaJson.tabelas[tabela] = { responde: true, total, amostra: regs.length, campos }
  console.log(`✔ ${tabela}: ${total} registro(s), ${Object.keys(campos).length} campo(s)`)
}

if (saida) fs.writeFileSync(saida, JSON.stringify(saidaJson, null, 2))
console.log(saida ? `\nCatalogo gravado em ${saida} (so nomes de campos, preenchimento e codigos curtos).` : '\n(use o 1o argumento para gravar o catalogo em JSON)')
