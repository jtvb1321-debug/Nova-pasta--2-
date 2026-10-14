// IXC FALSO, so para testar o Diagnostico de Conexao no computador (nunca fala com o IXC real).
//   npm run ixc:falso   (porta 4010)
// No .env.local do ambiente de teste:  IXC_API_URL=http://localhost:4010/webservice/v1  IXC_API_TOKEN=token-falso-local
// Dados 100% ficticios (scripts/ixc-falso-dados.ts).
import http from 'node:http'
import { responderIxc } from './ixc-falso-dados'

const PORTA = Number(process.env.IXC_FALSO_PORTA ?? 4010)

http.createServer((req, res) => {
  let corpo = ''
  req.on('data', c => { corpo += c })
  req.on('end', () => {
    const tabela = (req.url ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? ''
    res.setHeader('Content-Type', 'application/json')
    let p: any = {}
    try { p = JSON.parse(corpo || '{}') } catch { /* ignora */ }
    const r = responderIxc(tabela, p)
    if (!r) { res.statusCode = 404; res.end(JSON.stringify({ type: 'error', message: 'tabela nao existe no IXC falso' })); return }
    res.end(JSON.stringify(r))
  })
}).listen(PORTA, () => console.log(`IXC falso (ficticio) em http://localhost:${PORTA}/webservice/v1`))
