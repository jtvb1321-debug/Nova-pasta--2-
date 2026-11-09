// Relatorio "Vendas por mes": uma linha por mes do periodo escolhido (inclusive meses sem venda) e o total geral.
// Regras puras (sem banco nem rede), testadas em tests/ia/relatorioVendasMensal.test.ts.
//
// O mes de uma venda e' o da data da venda (campo "data") no horario de Brasilia. Os valores somam em centavos para
// nao acumular erro de ponto flutuante. "Valor total" soma todas as vendas do mes (pendentes, aprovadas e reprovadas);
// "Valor aprovado" soma so as aprovadas; a comissao e' a das vendas aprovadas.

const FUSO = 'America/Sao_Paulo'
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Limite de meses por relatorio (3 anos): evita consultas gigantes por engano. */
export const LIMITE_MESES = 36

const mesValido = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export const rotuloMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return `${NOME_MES[m - 1]}/${a}`
}

/** Meses de `inicio` a `fim` (AAAA-MM), em ordem. null se o formato for invalido, o periodo estiver invertido ou passar do limite. */
export function listarMeses(inicio: string, fim: string): string[] | null {
  if (!mesValido(inicio) || !mesValido(fim) || inicio > fim) return null
  const [ai, mi] = inicio.split('-').map(Number)
  const [af, mf] = fim.split('-').map(Number)
  const meses: string[] = []
  for (let a = ai, m = mi; a < af || (a === af && m <= mf); m === 12 ? (a++, m = 1) : m++) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`)
    if (meses.length > LIMITE_MESES) return null
  }
  return meses
}

/** Janela para buscar no banco: o periodo com 1 dia de folga em cada ponta. O mes exato de cada venda e' decidido depois por mesDaVenda. */
export function janelaDeBusca(meses: string[]): { de: Date; ate: Date } {
  const [ai, mi] = meses[0].split('-').map(Number)
  const [af, mf] = meses[meses.length - 1].split('-').map(Number)
  return { de: new Date(Date.UTC(ai, mi - 1, 1) - 86_400_000), ate: new Date(Date.UTC(af, mf, 1) + 86_400_000) }
}

/** "AAAA-MM" da data no horario de Brasilia (uma venda feita as 23h do ultimo dia ainda e' daquele mes). */
export function mesDaVenda(data: Date | string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).format(new Date(data))
}

export interface VendaBruta {
  valor: number | null
  status: string
  data: Date | string
  comissao?: { valor: number | null } | null
}

export interface LinhaMes {
  mes: string
  rotulo: string
  vendas: number
  aprovadas: number
  pendentes: number
  reprovadas: number
  valorTotal: number
  valorAprovado: number
  comissao: number
}

type Acumulador = Omit<LinhaMes, 'mes' | 'rotulo'>
const zerado = (): Acumulador => ({ vendas: 0, aprovadas: 0, pendentes: 0, reprovadas: 0, valorTotal: 0, valorAprovado: 0, comissao: 0 })
const centavos = (v: number | null | undefined) => Math.round((Number(v) || 0) * 100)

export function agruparPorMes(vendas: VendaBruta[], meses: string[]): { linhas: LinhaMes[]; total: LinhaMes } {
  const porMes = new Map<string, Acumulador>(meses.map(m => [m, zerado()]))
  for (const v of vendas) {
    const acc = porMes.get(mesDaVenda(v.data))
    if (!acc) continue // fora do periodo (veio da folga da busca)
    const c = centavos(v.valor)
    acc.vendas++
    acc.valorTotal += c
    if (v.status === 'APROVADO') {
      acc.aprovadas++
      acc.valorAprovado += c
      acc.comissao += centavos(v.comissao?.valor)
    } else if (v.status === 'PENDENTE') acc.pendentes++
    else if (v.status === 'REPROVADO') acc.reprovadas++
  }

  const soma = zerado()
  const linhas = meses.map(mes => {
    const a = porMes.get(mes)!
    for (const k of Object.keys(soma) as (keyof Acumulador)[]) soma[k] += a[k]
    return { mes, rotulo: rotuloMes(mes), ...emReais(a) }
  })
  return { linhas, total: { mes: 'TOTAL', rotulo: 'Total geral', ...emReais(soma) } }
}

function emReais(a: Acumulador): Acumulador {
  return { ...a, valorTotal: a.valorTotal / 100, valorAprovado: a.valorAprovado / 100, comissao: a.comissao / 100 }
}
