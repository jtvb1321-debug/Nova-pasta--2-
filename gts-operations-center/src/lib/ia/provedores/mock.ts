import { ErroProvedor, type ChamadaFerramentaModelo, type EntradaProvedor, type MensagemProvedor, type Provedor, type RespostaProvedor } from './tipos'

// Provedor "mock": NAO e' um modelo de IA. Escolhe ferramentas por palavras-chave e monta a resposta
// com o resumo devolvido pelas ferramentas. Serve para testar o fluxo inteiro (permissoes, auditoria,
// tela) sem chave e sem custo. Toda resposta sai marcada como SIMULADA.
//
// Para testar falhas do provedor, a pergunta pode conter [[mock:cota]], [[mock:autenticacao]],
// [[mock:timeout]], [[mock:indisponivel]] ou [[mock:invalida]] (so existe neste provedor).
// [[mock:ferramenta-proibida]] faz o "modelo" pedir uma ferramenta que o usuario nao pode usar e
// [[mock:ferramenta-inexistente]] pede uma que nao existe - para provar que o servidor nega.

export const ROTULO_MOCK = 'Resposta simulada (modo de teste, sem IA real)'

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const PEDIDO_DE_AJUDA = /(o que (voce|vc|tu) (pode|consegue|faz|sabe)|oque (voce|vc) (pode|consegue|faz)|\bajuda\b|como funciona|\bajude\b|\bajudar\b|\bola\b|\boi\b|bom dia|boa tarde|boa noite|\bmenu\b|\bcomandos?\b)/

// Uma pergunta de exemplo por ferramenta (so as da aba aberta aparecem).
const EXEMPLOS: { ferramenta: string; pergunta: string }[] = [
  { ferramenta: 'resumo_diario_chamados', pergunta: 'Como está a operação hoje?' },
  { ferramenta: 'chamados_criticos', pergunta: 'Quais chamados estão críticos agora?' },
  { ferramenta: 'analisar_sla', pergunta: 'Como está o SLA neste mês?' },
  { ferramenta: 'comparar_equipes', pergunta: 'Compare as equipes no mês anterior' },
  { ferramenta: 'produtividade', pergunta: 'Qual a produtividade dos últimos 30 dias?' },
  { ferramenta: 'consultar_metas', pergunta: 'Quais são as metas de SLA?' },
  { ferramenta: 'atendimentos_pendentes', pergunta: 'Quais atendimentos estão pendentes?' },
  { ferramenta: 'tendencias_desempenho', pergunta: 'Qual a tendência de desempenho?' },
  { ferramenta: 'materiais_abaixo_minimo', pergunta: 'Quais materiais precisamos repor?' },
  { ferramenta: 'prever_reposicao', pergunta: 'Faça uma previsão de reposição para 30 dias' },
  { ferramenta: 'consultar_movimentacoes', pergunta: 'Mostre as movimentações da semana' },
  { ferramenta: 'materiais_por_equipe', pergunta: 'Quais equipes têm material pendente de prestação de contas?' },
  { ferramenta: 'consultar_devolucoes', pergunta: 'Há devoluções aguardando aprovação?' },
  { ferramenta: 'analisar_consumo', pergunta: 'Qual foi o consumo de materiais nos últimos 90 dias?' },
  { ferramenta: 'consultar_equipamento', pergunta: 'Onde está o equipamento AA:BB:CC:00:00:01?' },
  { ferramenta: 'consultar_estoque', pergunta: 'Quanto temos de "ONU" em estoque?' },
]

function ultimaPergunta(m: MensagemProvedor[]): string {
  for (let i = m.length - 1; i >= 0; i--) if (m[i].role === 'user') return m[i].content ?? ''
  return ''
}

function periodoDe(t: string): { periodo?: string } {
  if (/\bhoje\b/.test(t)) return { periodo: 'hoje' }
  if (/(7 dias|semana)/.test(t)) return { periodo: '7d' }
  if (/mes anterior|mes passado/.test(t)) return { periodo: 'mes_anterior' }
  if (/(este mes|no mes|mensal)/.test(t)) return { periodo: 'mes' }
  if (/90 dias/.test(t)) return { periodo: '90d' }
  return {}
}

export function escolherFerramentas(pergunta: string, disponiveis: Set<string>): { nome: string; args: Record<string, unknown> }[] {
  const t = sem(pergunta)
  const per = periodoDe(t)
  const citado = pergunta.match(/["“'']([^"”'']{2,40})["”'']/)?.[1]
  const serial = pergunta.match(/\b([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}|[A-Za-z0-9]{8,20})\b/g)?.find(s => /\d/.test(s) && (/[:-]/.test(s) || /[A-Za-z]/.test(s)))
  const alvo: { nome: string; args: Record<string, unknown> }[] = []
  const quer = (nome: string, args: Record<string, unknown> = {}) => { if (disponiveis.has(nome) && !alvo.some(a => a.nome === nome)) alvo.push({ nome, args }) }

  // estoque
  if (/(repor|reposicao|abaixo do minimo|estoque minimo|falta de material|acabando)/.test(t)) { quer('materiais_abaixo_minimo'); if (/(prev|reposicao|compra|precisamos)/.test(t)) quer('prever_reposicao') }
  if (/(serial|\bmac\b|patrimonio|equipamento)/.test(t) && serial) quer('consultar_equipamento', { serial })
  if (/(movimenta|entrada|saida|transfer)/.test(t)) quer('consultar_movimentacoes', per)
  if (/devol/.test(t)) quer('consultar_devolucoes')
  if (/consumo|consumiu|gasto de material/.test(t)) quer('analisar_consumo', { ...per, ...(citado ? { itemBusca: citado } : {}) })
  if (/(material|materiais).*(equipe|tecnico|carro)|(equipe|tecnico|carro).*(material|materiais)|prestacao de contas/.test(t)) quer('materiais_por_equipe')
  if (/(saldo|estoque|produto|quantos|quantas|disponivel)/.test(t) && alvo.length === 0) quer('consultar_estoque', citado ? { busca: citado } : {})
  // operacoes
  if (/\bsla\b/.test(t)) quer('analisar_sla', per)
  if (/(critic|urgente|estourad)/.test(t)) quer('chamados_criticos')
  if (/compar/.test(t)) quer('comparar_equipes', per)
  if (/produtiv/.test(t)) quer('produtividade', per)
  if (/\bmetas?\b/.test(t)) quer('consultar_metas')
  if (/(pendente|em aberto|fila)/.test(t) && alvo.length === 0) quer('atendimentos_pendentes')
  if (/tendenc/.test(t)) quer('tendencias_desempenho')
  if (/(resumo|panorama|como esta|hoje)/.test(t) && alvo.length === 0) quer('resumo_diario_chamados')
  return alvo.slice(0, 3)
}

function extrairResumos(m: MensagemProvedor[]): { resumo: string; indicadores: { rotulo: string; valor: unknown; detalhe?: string }[]; avisos: string[] }[] {
  return m.filter(x => x.role === 'tool' && x.content).map(x => {
    try {
      const o = JSON.parse(x.content as string)
      if (o && typeof o === 'object' && 'erro' in o) return { resumo: `Consulta não realizada: ${String(o.erro)}`, indicadores: [], avisos: [] }
      return { resumo: String(o.resumo ?? ''), indicadores: Array.isArray(o.indicadores) ? o.indicadores : [], avisos: Array.isArray(o.avisos) ? o.avisos : [] }
    } catch {
      return { resumo: 'Resultado ilegível.', indicadores: [], avisos: [] }
    }
  })
}

export function criarProvedorMock(): Provedor {
  return {
    nome: 'mock',
    async completar(entrada: EntradaProvedor): Promise<RespostaProvedor> {
      const pergunta = ultimaPergunta(entrada.mensagens)
      const marcador = pergunta.match(/\[\[mock:([a-z-]+)\]\]/)?.[1]
      if (marcador === 'cota') throw new ErroProvedor('COTA', 'mock: cota esgotada')
      if (marcador === 'autenticacao') throw new ErroProvedor('AUTENTICACAO', 'mock: chave recusada')
      if (marcador === 'timeout') throw new ErroProvedor('TIMEOUT', 'mock: timeout')
      if (marcador === 'indisponivel') throw new ErroProvedor('INDISPONIVEL', 'mock: indisponivel')
      if (marcador === 'invalida') throw new ErroProvedor('RESPOSTA_INVALIDA', 'mock: resposta invalida')

      const base = { modelo: 'mock-regras', provedor: 'mock' as const, simulada: true }
      const jaTemResultado = entrada.mensagens.some(m => m.role === 'tool')

      if (!jaTemResultado) {
        const chamadas: ChamadaFerramentaModelo[] = []
        if (marcador === 'ferramenta-proibida') {
          // Pede uma ferramenta que a tela nao ofereceu: o servidor precisa negar.
          const oferecidas = new Set(entrada.ferramentas.map(f => f.function.name))
          const proibida = ['consultar_estoque', 'resumo_diario_chamados'].find(n => !oferecidas.has(n)) ?? 'consultar_estoque'
          chamadas.push({ id: 'mock_1', nome: proibida, argumentos: '{}' })
        } else if (marcador === 'ferramenta-inexistente') {
          chamadas.push({ id: 'mock_1', nome: 'apagar_estoque', argumentos: '{"itemId":"x"}' })
        } else {
          const disponiveis = new Set(entrada.ferramentas.map(f => f.function.name))
          escolherFerramentas(pergunta, disponiveis).forEach((f, i) => chamadas.push({ id: `mock_${i + 1}`, nome: f.nome, argumentos: JSON.stringify(f.args) }))
        }
        if (chamadas.length > 0) return { ...base, texto: null, chamadas }
        const nomes = new Set(entrada.ferramentas.map(f => f.function.name))
        const exemplos = EXEMPLOS.filter(e => nomes.has(e.ferramenta)).map(e => `• ${e.pergunta}`)
        const lista = exemplos.length ? `\n\nPerguntas que eu sei responder neste modo:\n${exemplos.join('\n')}` : ''
        if (PEDIDO_DE_AJUDA.test(sem(pergunta))) {
          return {
            ...base, chamadas: [],
            texto: `${ROTULO_MOCK}\n\nEu só CONSULTO dados (não altero estoque, chamados nem nada no sistema) e mostro números, referências e recomendações.${lista}`,
          }
        }
        return {
          ...base, chamadas: [],
          texto: `${ROTULO_MOCK}\n\nNão entendi qual consulta fazer. O modo de teste só reconhece palavras-chave (como SLA, repor, crítico, movimentações, devoluções, serial); para escrever com suas próprias palavras é preciso ativar um modelo de IA (OpenRouter).${lista}`,
        }
      }

      const resumos = extrairResumos(entrada.mensagens)
      const linhas = resumos.flatMap(r => [
        `• ${r.resumo}`,
        ...r.indicadores.slice(0, 4).map(i => `   – ${i.rotulo}: ${String(i.valor)}${i.detalhe ? ` (${i.detalhe})` : ''}`),
        ...r.avisos.slice(0, 1).map(a => `   ! ${a}`),
      ])
      return { ...base, chamadas: [], texto: `${ROTULO_MOCK}\n\n${linhas.join('\n')}` }
    },
  }
}
