// Leitor do "Historico do atendimento" (PDF exportado do painel do OPA). Puro: recebe o TEXTO do PDF e devolve so o necessario
// para a Gestao de Desempenho. Nada de dado de cliente sai daqui: o nome do cliente e' usado apenas para separar quem fala,
// e NAO e' devolvido; nem o contato, nem o conteudo das mensagens.
//
// Formato observado (exportacao real, nov/2026): cabecalho "Protocolo / Cliente / Contato / Horario de abertura / Inicio do
// atendimento / Fim do atendimento" e, depois, mensagens no padrao: remetente, texto..., horario ("26 de novembro de 2026 15:54",
// as vezes precedido de "Lida - " ou "Entregue - "). Eventos: "<atendente> iniciou o atendimento", "<atendente> encerrou o
// atendimento", "VIC_BOT transferiu o atendimento para *Departamento*". Horarios sao de Fortaleza (UTC-3, sem horario de verao).

const MESES: Record<string, number> = { janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }
const RE_DATA = /(\d{1,2}) de ([a-zç]+) de (\d{4}) (\d{2}):(\d{2})/i
/** Linha que fecha uma mensagem: so o horario, com prefixo opcional de status ("Lida - ", "Entregue - "). */
const RE_FIM_MENSAGEM = /^(?:[\p{L}]+ - )?(\d{1,2} de [a-zç]+ de \d{4} \d{2}:\d{2})$/iu
const RE_EVENTO = /(iniciou|encerrou) o atendimento$/
const RE_DESPEDIDA = /seguimos a disposi/i
const RE_FOOTER = /^\d+ \/ \d+$/

/** "26 de novembro de 2026 15:54" -> instante (hora de Fortaleza, UTC-3). null se nao for uma data valida. */
export function dataDoHistorico(texto: string | null | undefined): Date | null {
  const m = (texto ?? '').match(RE_DATA)
  if (!m) return null
  const mes = MESES[m[2].toLowerCase()]
  if (!mes) return null
  const d = new Date(Date.UTC(+m[3], mes - 1, +m[1], +m[4] + 3, +m[5]))
  return Number.isNaN(d.getTime()) ? null : d
}

const limpar = (s: string) => s.replace(/[^\p{L}\p{N}_ ]/gu, ' ').replace(/\s+/g, ' ').trim()
const minutos = (a: Date | null | undefined, b: Date | null | undefined) => (a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : null)

export interface HistoricoAtendimento {
  protocolo: string
  abertura: Date
  inicio: Date | null
  fim: Date | null
  /** Nome (1a palavra, como aparece no OPA) de quem iniciou o atendimento; null = so o robo (ninguem assumiu). */
  atendente: string | null
  /** Departamento escolhido no robo (Suporte, Financeiro...). */
  departamento: string | null
  /** Hora da primeira fala do atendente (sem os eventos do sistema e sem a despedida automatica). */
  primeiraRespostaEm: Date | null
  /** Transferencias feitas por atendentes (a do robo para a fila nao conta). */
  transferenciasEntreAtendentes: number
  /** Do envio a fila (ou da abertura, se nao houver) ate o atendente iniciar. */
  esperaMin: number | null
  /** Media do tempo entre a mensagem do cliente e a resposta do atendente. null = sem resposta medida. */
  tempoRespostaMedioMin: number | null
  /** Inicio -> fim registrado no OPA (inclui chats esquecidos abertos e fechados em lote). */
  duracaoRegistradaMin: number | null
  /** Inicio -> ultima mensagem real (sem a despedida automatica); mostra o tempo realmente conversado. */
  duracaoAtivaMin: number | null
  mensagensAtendente: number
  mensagensCliente: number
}

interface Mensagem { quem: string; texto: string; t: Date | null }

/** Le o texto de UM PDF. null = nao parece um historico do OPA (sem protocolo ou sem horario de abertura). */
export function lerHistorico(textoBruto: string): HistoricoAtendimento | null {
  const texto = textoBruto.replace(/\r/g, '').replace(/\f/g, '\n')
  const pega = (re: RegExp) => texto.match(re)?.[1]?.trim() ?? null
  const protocolo = pega(/Protocolo:\s*(\S+)/)
  const abertura = dataDoHistorico(pega(/Hor.rio de abertura:\s*(.+)/))
  if (!protocolo || !abertura) return null
  const inicio = dataDoHistorico(pega(/In.cio do atendimento:\s*(.+)/))
  const fim = dataDoHistorico(pega(/Fim do atendimento:\s*(.+)/))
  const nomeCliente = limpar(pega(/Cliente:\s*(.+)/) ?? '')

  const marcaCorpo = texto.search(/Fim do atendimento:/)
  const corpo = marcaCorpo >= 0 ? texto.slice(marcaCorpo).split('\n').slice(1) : []
  const linhas = corpo.map(l => l.trim()).filter(l => l && !RE_FOOTER.test(l))

  // Cada mensagem termina na linha do horario; a 1a linha acumulada e' o remetente e as demais, o texto.
  const msgs: Mensagem[] = []
  let atual: string[] = []
  for (const l of linhas) {
    const fimMsg = l.match(RE_FIM_MENSAGEM)
    if (fimMsg && atual.length >= 1) {
      msgs.push({ quem: limpar(atual[0]), texto: atual.slice(1).join(' '), t: dataDoHistorico(fimMsg[1]) })
      atual = []
    } else atual.push(l)
  }

  const ehRobo = (q: string) => /^VIC_BOT/i.test(q)
  const ehCliente = (q: string) => nomeCliente !== '' && q === nomeCliente
  const ehPessoa = (m: Mensagem) => !ehRobo(m.quem) && !ehCliente(m.quem)

  const eventoInicio = msgs.find(m => ehPessoa(m) && /iniciou o atendimento$/.test(m.texto))
  const atendente = eventoInicio ? limpar(eventoInicio.texto.replace(/iniciou o atendimento$/, '')).split(' ')[0] || null : null
  const transfRobo = msgs.find(m => ehRobo(m.quem) && /transferiu o atendimento para/.test(m.texto))
  const departamento = transfRobo ? limpar((transfRobo.texto.match(/para \*?([^*]+?)\*?$/) ?? [])[1] ?? '') || null : null
  const transferencias = msgs.filter(m => ehPessoa(m) && /transferiu o atendimento para/.test(m.texto)).length

  const falasAtendente = msgs.filter(m => ehPessoa(m) && !RE_EVENTO.test(m.texto) && !RE_DESPEDIDA.test(m.texto))
  const aposInicio = eventoInicio ? msgs.filter(m => m.t && eventoInicio.t && m.t >= eventoInicio.t) : []
  const respostas: number[] = []
  for (let i = 0; i < aposInicio.length; i++) {
    const m = aposInicio[i]
    if (!ehCliente(m.quem) || (i > 0 && ehCliente(aposInicio[i - 1].quem))) continue // so a 1a mensagem de cada sequencia do cliente
    const resposta = aposInicio.slice(i + 1).find(x => ehPessoa(x) && !RE_EVENTO.test(x.texto) && !RE_DESPEDIDA.test(x.texto))
    const tempo = minutos(m.t, resposta?.t)
    if (tempo !== null && tempo >= 0) respostas.push(tempo)
  }
  const reais = msgs.filter(m => !ehRobo(m.quem) && !RE_EVENTO.test(m.texto) && !RE_DESPEDIDA.test(m.texto))
  const ultimaReal = reais.length ? reais[reais.length - 1].t : null
  const ativa = minutos(inicio, ultimaReal)

  return {
    protocolo,
    abertura,
    inicio,
    fim,
    atendente,
    departamento,
    primeiraRespostaEm: falasAtendente[0]?.t ?? null,
    transferenciasEntreAtendentes: transferencias,
    esperaMin: inicio ? Math.max(0, minutos(transfRobo?.t ?? abertura, inicio) ?? 0) : null,
    tempoRespostaMedioMin: respostas.length ? Math.round((respostas.reduce((s, x) => s + x, 0) / respostas.length) * 10) / 10 : null,
    duracaoRegistradaMin: inicio && fim ? Math.max(0, minutos(inicio, fim) ?? 0) : null,
    duracaoAtivaMin: ativa === null ? null : Math.max(0, ativa),
    mensagensAtendente: falasAtendente.length,
    mensagensCliente: msgs.filter(m => ehCliente(m.quem)).length,
  }
}
