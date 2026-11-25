// SIMULADOR no FORMATO REAL do OPA Suite (conforme a documentacao publica): GET com corpo { filter, options }.
// SOMENTE PARA TESTES: os dados sao inventados, o formato segue a documentacao. Recusa NODE_ENV=production.

function recusarEmProducao() {
  if (process.env.NODE_ENV === 'production') throw new Error('Provedor SIMULADO do OPA nao pode ser usado em producao.')
}

export interface AtendimentoOpaSuite { _id: string; id_atendente: string; protocolo: string; status: 'F' | 'EA'; date: string; fim?: string }

/** `quantidade` atendimentos do dia para o atendente: 4 de cada 5 finalizados (20 min), os demais em atendimento. */
export function gerarAtendimentosOpaSuite(dia: string, atendenteId: string, quantidade: number, inicioNumero = 1): AtendimentoOpaSuite[] {
  recusarEmProducao()
  return Array.from({ length: quantidade }, (_, i) => {
    const n = inicioNumero + i
    const hora = String(8 + (i % 9)).padStart(2, '0')
    const finalizado = i % 5 !== 4
    return {
      _id: `opa-${atendenteId}-${dia}-${n}`, id_atendente: atendenteId, protocolo: `OPA${dia.replace(/-/g, '')}${n}`,
      status: finalizado ? 'F' : 'EA', date: `${dia}T${hora}:00:00-03:00`, ...(finalizado ? { fim: `${dia}T${hora}:20:00-03:00` } : {}),
    }
  })
}

const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' })

/** Servidor falso do OPA Suite: exige "Authorization: Bearer", le o corpo JSON, aplica filtros de data/status/atendente, skip e limit. */
export function criarFetchOpaSuite(itens: AtendimentoOpaSuite[], opcoes: { token: string; usuarios?: { _id: string; nome: string }[]; falhasIniciais?: number } = { token: 'x' }) {
  recusarEmProducao()
  const chamadas: { caminho: string; corpo: any; autorizado: boolean }[] = []
  let falhas = opcoes.falhasIniciais ?? 0
  const fetchFalso = (async (url: any, init: any) => {
    const u = new URL(String(url))
    const corpo = init?.body ? JSON.parse(String(init.body)) : null
    const autorizado = init?.headers?.Authorization === `Bearer ${opcoes.token}`
    chamadas.push({ caminho: u.pathname, corpo, autorizado })
    if (init?.method !== 'GET') return new Response('{}', { status: 405 })
    if (!autorizado) return new Response(JSON.stringify({ status: 'error', code: 401 }), { status: 401 })
    if (falhas > 0) { falhas--; return new Response('{}', { status: 503 }) }
    const f = corpo?.filter ?? {}
    const op = corpo?.options ?? {}
    if (u.pathname.startsWith('/api/v1/usuario')) {
      if (Object.keys(f).length === 0) return new Response(JSON.stringify({ status: 'error', code: 400, message: 'At least one valid filter is required' }), { status: 400 })
      const achados = (opcoes.usuarios ?? []).filter(x => !f.nome || x.nome.toLowerCase().includes(String(f.nome).toLowerCase()))
      return new Response(JSON.stringify({ status: 'success', code: 200, data: achados.map(x => ({ ...x, status: 'A', tipo: 'user' })) }), { status: 200 })
    }
    if (!u.pathname.startsWith('/api/v1/atendimento')) return new Response('{}', { status: 404 })
    // Cada consulta usa so um par de datas (abertura OU encerramento), como o cliente faz.
    const lista = itens.filter(a =>
      (!f.dataInicialAbertura || diaDe(a.date) >= f.dataInicialAbertura) && (!f.dataFinalAbertura || diaDe(a.date) <= f.dataFinalAbertura) &&
      (!f.dataInicialEncerramento || (!!a.fim && diaDe(a.fim) >= f.dataInicialEncerramento)) && (!f.dataFinalEncerramento || (!!a.fim && diaDe(a.fim) <= f.dataFinalEncerramento)) &&
      (!f.status || a.status === f.status) && (!f.id_atendente || a.id_atendente === f.id_atendente))
    const ini = op.skip ?? 0
    return new Response(JSON.stringify({ status: 'success', code: 200, data: lista.slice(ini, ini + (op.limit ?? lista.length)) }), { status: 200 })
  }) as typeof fetch
  return { fetch: fetchFalso, chamadas }
}
