// SONDA SOMENTE LEITURA do IXC: confirma se a tabela de sessoes (radacct) responde e quais campos traz,
// para o Diagnostico de Conexao mostrar consumo/sessoes reais. Nao altera nada.
//
//   npm run ixc:sonda -- <login>        (usa IXC_API_URL e IXC_API_TOKEN do .env.local)
//
// Mostra so NOMES de campos, se vieram preenchidos e valores de campos tecnicos sem dado pessoal
// (volume, duracao, motivo, datas). Nunca imprime login, IP, MAC nem tokens.
import { listarIXC } from '../src/lib/ixc'

const LIVRES = new Set(['acctstarttime', 'acctstoptime', 'acctsessiontime', 'acctinputoctets', 'acctoutputoctets', 'acctinputgigawords', 'acctoutputgigawords', 'acctterminatecause', 'acctupdatetime'])

async function main() {
  const login = process.argv[2]
  if (!login || login.length < 3) { console.error('Uso: npm run ixc:sonda -- <login do cliente>'); process.exit(1) }
  try {
    const regs: Record<string, unknown>[] = await listarIXC('radacct', { qtype: 'username', query: login, oper: '=', rp: 3, sortname: 'acctstarttime', sortorder: 'desc' })
    if (!regs.length) { console.log('A tabela radacct RESPONDEU, mas nao ha sessoes para esse login (ou o login nao existe).'); return }
    console.log(`radacct respondeu com ${regs.length} sessao(oes) de amostra. Campos:`)
    const campos = Object.keys(regs[0])
    for (const c of campos) {
      const preenchidos = regs.filter(r => r[c] != null && String(r[c]).trim() !== '' && String(r[c]) !== '0').length
      console.log(`  - ${c}: ${preenchidos}/${regs.length} preenchido(s)${LIVRES.has(c) ? ` | ex.: ${String(regs[0][c])}` : ''}`)
    }
    const faltam = ['acctstarttime', 'acctstoptime', 'acctinputoctets', 'acctoutputoctets', 'acctterminatecause'].filter(c => !campos.includes(c))
    console.log(faltam.length ? `\nATENCAO: campos esperados que NAO vieram: ${faltam.join(', ')}. O consumo/sessoes ficara "Nao disponivel pelo IXC" ate isso mudar.` : '\nOK: os campos usados pelo Diagnostico de Conexao estao presentes.')
  } catch (e) {
    console.error('A tabela radacct NAO respondeu nesta API do IXC:', String((e as Error).message).replace(/Basic\s+\S+/g, '[oculto]').slice(0, 200))
    console.error('O Diagnostico de Conexao continua funcionando, mas consumo e sessoes aparecerao como "Nao disponivel pelo IXC".')
    process.exit(2)
  }
}
main()
