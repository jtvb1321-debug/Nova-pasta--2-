// Filtros da listagem de chamados (Central de Chamados), compartilhados entre
// a lista (/api/tickets) e os indicadores (/api/tickets/resumo) para que os
// totais sempre sigam exatamente os mesmos criterios da lista.

const TIPOS = ['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'ROMPIMENTO_MASSIVO', 'SUPORTE']

// Aplica no `where` os filtros: eace (true/false), tipo, cidade e busca.
// Nao mexe em status/equipe/periodo (cada rota trata a sua).
export function aplicarFiltrosListagem(where: any, params: URLSearchParams) {
  const eace = params.get('eace')
  if (eace === 'true') where.eace = true
  else if (eace === 'false') where.eace = false

  const tipo = params.get('tipo')
  if (tipo && TIPOS.includes(tipo)) where.tipo = tipo

  const cidade = params.get('cidade')?.trim()
  if (cidade) where.cidade = { equals: cidade, mode: 'insensitive' }

  const busca = params.get('search')?.trim()
  if (busca) {
    // Numero do chamado: o final do id, como mostrado na tela (OS-XXXXXXXX).
    const numero = busca.replace(/^#/, '').replace(/^os-/i, '')
    const ou: any[] = [
      { cliente: { contains: busca, mode: 'insensitive' } },
      { endereco: { contains: busca, mode: 'insensitive' } },
      { bairro: { contains: busca, mode: 'insensitive' } },
      { escolaCodigoInep: { contains: busca } },
    ]
    if (numero.length >= 3) ou.push({ id: { endsWith: numero, mode: 'insensitive' } })
    where.AND = [...(where.AND ?? []), { OR: ou }]
  }
}
