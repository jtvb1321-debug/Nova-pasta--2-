import { prisma } from './prisma'
import { listarIXC, paraNumero } from './ixc'

interface RefCidade { nome: string; ufId: string }

async function buscarMapaCidadesEUf(): Promise<{ cidades: Map<string, RefCidade>; ufs: Map<string, string> }> {
  const cidades = new Map<string, RefCidade>()
  const ufs = new Map<string, string>()

  try {
    const registrosUf = await buscarTodosPaginado('uf')
    for (const u of registrosUf) {
      if (u.id && u.sigla) ufs.set(String(u.id), u.sigla)
    }
  } catch (err: any) {
    console.error('[IXC Sync] Falha ao buscar tabela uf:', err.message)
  }

  try {
    const registrosCidade = await buscarTodosPaginado('cidade')
    for (const c of registrosCidade) {
      if (c.id && c.nome) cidades.set(String(c.id), { nome: c.nome, ufId: String(c.uf || '') })
    }
  } catch (err: any) {
    console.error('[IXC Sync] Falha ao buscar tabela cidade:', err.message)
  }

  return { cidades, ufs }
}

async function buscarTodosPaginado(tabela: string, filtroExtra: Record<string, any> = {}) {
  let pagina = 1
  const todos: any[] = []
  while (true) {
    const registros = await listarIXC(tabela, { rp: 2000, page: pagina, ...filtroExtra })
    if (!registros || registros.length === 0) break
    todos.push(...registros)
    if (registros.length < 2000) break
    pagina++
    if (pagina > 30) break
  }
  return todos
}

function paraData(str: string | null | undefined): Date | null {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function mapearFormaPagamento(tipo: string | undefined | null): 'PIX' | 'DINHEIRO' | 'BOLETO' | 'CARTAO' | undefined {
  if (!tipo) return undefined
  const t = tipo.toLowerCase()
  if (t.includes('pix')) return 'PIX'
  if (t.includes('dinheiro')) return 'DINHEIRO'
  if (t.includes('boleto')) return 'BOLETO'
  if (t.includes('cart')) return 'CARTAO'
  return undefined
}

export interface ResultadoSincronizacao {
  clientesProcessados: number
  clientesCriados: number
  clientesAtualizados: number
  titulosProcessados: number
  titulosCriados: number
  titulosAtualizados: number
  baixasAplicadas: number
  erros: string[]
}

let intervaloAtivo: NodeJS.Timeout | null = null

export function iniciarSincronizacaoAutomatica(intervaloMinutos = 15) {
  if (intervaloAtivo) return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  console.log(`[IXC Sync] Sincronizacao automatica iniciada (a cada ${intervaloMinutos} min)`)

  intervaloAtivo = setInterval(async () => {
    try {
      const resultado = await sincronizarClientesIXC()
      console.log('[IXC Sync] Sincronizacao automatica concluida:', resultado)
    } catch (error) {
      console.error('[IXC Sync] Erro na sincronizacao automatica:', error)
    }
  }, intervaloMinutos * 60 * 1000)
}

export async function sincronizarClientesIXC(): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = {
    clientesProcessados: 0, clientesCriados: 0, clientesAtualizados: 0,
    titulosProcessados: 0, titulosCriados: 0, titulosAtualizados: 0,
    baixasAplicadas: 0, erros: [],
  }

  const clientesIxc = await buscarTodosPaginado('cliente', { qtype: 'ativo', query: 'S', oper: '=' })
  const { cidades: mapaCidades, ufs: mapaUfs } = await buscarMapaCidadesEUf()
  const mapaIdCliente = new Map<string, string>()

  for (const c of clientesIxc) {
    try {
      const codigoIxc = String(c.id)
      const cidadeRef = c.cidade ? mapaCidades.get(String(c.cidade)) : undefined
      const ufId = c.uf || cidadeRef?.ufId || ''
      const dadosBase = {
        nome: c.razao || c.fantasia || `Cliente ${codigoIxc}`,
        cpfCnpj: c.cnpj_cpf || null,
        telefone: c.telefone_celular || c.fone || null,
        endereco: c.endereco || null,
        numero: c.numero || null,
        complemento: c.complemento || null,
        bairro: c.bairro || null,
        bloco: c.bloco || null,
        apartamento: c.apartamento || null,
        cep: c.cep || null,
        cidade: cidadeRef?.nome || null,
        uf: mapaUfs.get(String(ufId)) || null,
      }

      const existente = await prisma.cliente.findUnique({ where: { codigoIxc } })
      let clienteAtualizado
      if (existente) {
        // Nao mexe no status: se foi inativado manualmente aqui, o sync respeita essa decisao
        clienteAtualizado = await prisma.cliente.update({ where: { id: existente.id }, data: dadosBase })
        resultado.clientesAtualizados++
      } else {
        clienteAtualizado = await prisma.cliente.create({
          data: { ...dadosBase, codigoIxc, status: 'ATIVO' },
        })
        resultado.clientesCriados++
      }

      mapaIdCliente.set(codigoIxc, clienteAtualizado.id)
      resultado.clientesProcessados++
    } catch (err: any) {
      resultado.erros.push(`Cliente IXC ${c.id}: ${err.message}`)
    }
  }

  const sessentaDiasAtras = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
  const dataFiltro = sessentaDiasAtras.toISOString().split('T')[0]
  const titulosIxc = await buscarTodosPaginado('fn_areceber', {
    qtype: 'data_vencimento', query: dataFiltro, oper: '>=',
  })

  for (const t of titulosIxc) {
    try {
      const idClienteIxc = String(t.id_cliente)
      const nossoClienteId = mapaIdCliente.get(idClienteIxc)
      if (!nossoClienteId) continue

      const idTituloIxc = String(t.id)
      const valor = paraNumero(t.valor) ?? 0
      const valorJuros = (paraNumero(t.valor_juros) ?? 0) + (paraNumero(t.valor_multas) ?? 0)
      const valorDesconto = paraNumero(t.desconto_condicional_valor) ?? 0
      const dataVencimento = paraData(t.data_vencimento)
      const competencia = dataVencimento || new Date()
      const pagoNoIxc = !!t.baixa_data

      // A sincronizacao NUNCA altera status/pagamento no nosso sistema.
      // Ela so atualiza os dados informativos do IXC (statusIxc/dataBaixaIxc),
      // que aparecem como observacao. A baixa de verdade e sempre manual, feita
      // pelo operador dentro do nosso sistema.
      const dados: any = {
        clienteId: nossoClienteId,
        competencia,
        valor,
        dataVencimento,
        valorJuros,
        valorDesconto,
        statusIxc: pagoNoIxc ? 'BAIXADO' : 'PENDENTE',
        dataBaixaIxc: paraData(t.baixa_data),
      }

      const existente = await prisma.contaReceber.findUnique({ where: { idTituloIxc } })

      if (existente) {
        await prisma.contaReceber.update({ where: { id: existente.id }, data: dados })
        resultado.titulosAtualizados++
      } else {
        await prisma.contaReceber.create({ data: { ...dados, idTituloIxc } })
        resultado.titulosCriados++
      }

      resultado.titulosProcessados++
    } catch (err: any) {
      resultado.erros.push(`Titulo IXC ${t.id}: ${err.message}`)
    }
  }

  return resultado
}