const IXC_API_URL = process.env.IXC_API_URL
const IXC_API_TOKEN = process.env.IXC_API_TOKEN

function authHeader() {
  const credenciais = Buffer.from(`${IXC_API_TOKEN}`).toString('base64')
  return `Basic ${credenciais}`
}

interface ListarParams {
  qtype?: string
  query?: string
  oper?: string
  page?: number
  rp?: number
  sortname?: string
  sortorder?: string
}

export async function listarIXC(tabela: string, params: ListarParams = {}) {
  if (!IXC_API_URL || !IXC_API_TOKEN) {
    throw new Error('IXC_API_URL ou IXC_API_TOKEN nao configurados no .env')
  }

  const body = {
    qtype: params.qtype || 'id',
    query: params.query || '',
    oper: params.oper || '>',
    page: String(params.page || 1),
    rp: String(params.rp || 5000),
    sortname: params.sortname || 'id',
    sortorder: params.sortorder || 'asc',
  }

  const res = await fetch(`${IXC_API_URL}/${tabela}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader(),
      'ixcsoft': 'listar',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`Erro na API do IXC (${tabela}): ${res.status} - ${texto}`)
  }

  const data = await res.json()
  return data.registros || []
}

export function paraNumero(valor: any): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(String(valor).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}