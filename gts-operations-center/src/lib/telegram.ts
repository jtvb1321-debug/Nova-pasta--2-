import { readFile } from 'fs/promises'
import { join } from 'path'
import { formatarEnderecoCompleto } from './utils'
import {
  CLASSIFICACAO_LABEL, CLASSIFICACAO_EMOJI, ORIGEM_LABEL,
  PROBLEMA_ENCONTRADO_LABEL, RESULTADO_FINAL_LABEL,
  type Classificacao, type OrigemProvavel,
} from './diagnosticoEngine'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { gerarImagemAgenda } from './agendaImagem'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const GROUP_OS  = process.env.TELEGRAM_GROUP_OS

export interface ResultadoEnvio { ok: boolean; erro?: string }

const LIMITE_TEXTO = 4000 // o Telegram recusa mensagem acima de 4096 caracteres

/** Mesmo texto sem as marcacoes HTML (usado quando o Telegram recusa o HTML, por exemplo por um "<" ou "&" digitado no relato). */
export function textoSemHtml(texto: string): string {
  return texto.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** Divide em partes de ate LIMITE_TEXTO, preferindo quebrar em linha. */
export function dividirTexto(texto: string, limite = LIMITE_TEXTO): string[] {
  if (texto.length <= limite) return [texto]
  const partes: string[] = []
  let resto = texto
  while (resto.length > limite) {
    let corte = resto.lastIndexOf('\n', limite)
    if (corte < limite / 2) corte = limite
    partes.push(resto.slice(0, corte))
    resto = resto.slice(corte).replace(/^\n+/, '')
  }
  if (resto) partes.push(resto)
  return partes
}

interface RespostaTelegram { ok: boolean; status: number; descricao: string; esperar: number | null; novoChat: string | null }
async function chamarTelegram(metodo: string, corpo: Record<string, unknown>): Promise<RespostaTelegram> {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000),
  })
  const json: any = await r.json().catch(() => ({}))
  return { ok: r.ok && json.ok !== false, status: r.status, descricao: String(json.description ?? ''), esperar: Number(json.parameters?.retry_after) || null, novoChat: json.parameters?.migrate_to_chat_id != null ? String(json.parameters.migrate_to_chat_id) : null }
}

async function enviarParte(chatId: string, texto: string): Promise<ResultadoEnvio> {
  let r = await chamarTelegram('sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML' })
  // Limite de envios: espera o que o Telegram pediu (ate 10 s) e tenta de novo uma vez.
  if (!r.ok && r.status === 429 && r.esperar && r.esperar <= 10) {
    await new Promise(res => setTimeout(res, r.esperar! * 1000))
    r = await chamarTelegram('sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML' })
  }
  // HTML recusado (ex.: "<" ou "&" no relato): reenvia como texto simples, para a mensagem nunca se perder.
  if (!r.ok && r.status === 400 && /parse entities/i.test(r.descricao)) {
    console.error('[Telegram] HTML recusado, reenviando como texto simples:', r.descricao)
    r = await chamarTelegram('sendMessage', { chat_id: chatId, text: textoSemHtml(texto) })
  }
  if (r.ok) return { ok: true }
  const motivo = r.novoChat ? `o grupo virou supergrupo; novo id ${r.novoChat}` : `HTTP ${r.status}: ${r.descricao || 'sem descrição'}`
  console.error('[Telegram] sendMessage falhou:', motivo)
  return { ok: false, erro: motivo }
}

/** Envia texto ao Telegram. Nunca lanca: devolve o resultado e deixa a falha registrada no log do servidor. */
export async function enviarMensagem(chatId: string, texto: string): Promise<ResultadoEnvio> {
  if (!BOT_TOKEN) { console.error('[Telegram] TELEGRAM_BOT_TOKEN não configurado: mensagem não enviada.'); return { ok: false, erro: 'TELEGRAM_BOT_TOKEN não configurado' } }
  if (!chatId) { console.error('[Telegram] TELEGRAM_GROUP_OS não configurado: mensagem não enviada.'); return { ok: false, erro: 'TELEGRAM_GROUP_OS não configurado' } }
  try {
    let ultimo: ResultadoEnvio = { ok: true }
    for (const parte of dividirTexto(texto)) {
      ultimo = await enviarParte(chatId, parte)
      if (!ultimo.ok) return ultimo
    }
    return ultimo
  } catch (error: any) {
    const motivo = error?.name === 'TimeoutError' ? 'o Telegram não respondeu a tempo' : String(error?.message ?? error).slice(0, 160)
    console.error('[Telegram] erro ao enviar:', motivo)
    return { ok: false, erro: motivo }
  }
}

export interface DiagnosticoTelegram {
  tokenConfigurado: boolean
  grupoConfigurado: boolean
  bot: { ok: boolean; usuario?: string; erro?: string }
  grupo: { ok: boolean; titulo?: string; tipo?: string; erro?: string }
  botNoGrupo: { ok: boolean; situacao?: string; podeEnviar?: boolean; erro?: string }
}

async function consultarTelegram(metodo: string, corpo?: Record<string, unknown>): Promise<{ ok: boolean; resultado?: any; erro?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${metodo}`, corpo
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000) }
      : { signal: AbortSignal.timeout(15_000) })
    const json: any = await r.json().catch(() => ({}))
    return json.ok ? { ok: true, resultado: json.result } : { ok: false, erro: `HTTP ${r.status}: ${json.description ?? 'sem descrição'}` }
  } catch (e: any) {
    return { ok: false, erro: e?.name === 'TimeoutError' ? 'o Telegram não respondeu a tempo' : 'sem conexão com o Telegram' }
  }
}

/** Confere, SEM enviar nada, se o bot e o grupo de O.S. estao configurados e se o bot pode escrever no grupo. */
export async function diagnosticarTelegram(): Promise<DiagnosticoTelegram> {
  const d: DiagnosticoTelegram = { tokenConfigurado: !!BOT_TOKEN, grupoConfigurado: !!GROUP_OS, bot: { ok: false }, grupo: { ok: false }, botNoGrupo: { ok: false } }
  if (!BOT_TOKEN) { d.bot.erro = 'TELEGRAM_BOT_TOKEN não configurado'; return d }
  const me = await consultarTelegram('getMe')
  d.bot = me.ok ? { ok: true, usuario: me.resultado?.username } : { ok: false, erro: me.erro }
  if (!GROUP_OS) { d.grupo.erro = 'TELEGRAM_GROUP_OS não configurado'; return d }
  const chat = await consultarTelegram('getChat', { chat_id: GROUP_OS })
  d.grupo = chat.ok ? { ok: true, titulo: chat.resultado?.title, tipo: chat.resultado?.type } : { ok: false, erro: chat.erro }
  if (me.ok && chat.ok) {
    const m = await consultarTelegram('getChatMember', { chat_id: GROUP_OS, user_id: me.resultado?.id })
    if (m.ok) {
      const situacao = String(m.resultado?.status ?? '')
      const podeEnviar = situacao === 'administrator' || situacao === 'creator' || (situacao === 'member' && m.resultado?.can_send_messages !== false)
      d.botNoGrupo = { ok: podeEnviar, situacao, podeEnviar, ...(podeEnviar ? {} : { erro: situacao === 'restricted' ? 'o bot está restrito no grupo' : 'o bot não faz parte do grupo' }) }
    } else d.botNoGrupo = { ok: false, erro: m.erro }
  }
  return d
}

/** Mensagem de teste, claramente marcada, ao grupo de O.S. (so a tela de Configuracoes, para ADMIN). */
export async function enviarTesteTelegram(nomeUsuario: string): Promise<ResultadoEnvio> {
  return enviarMensagem(GROUP_OS!, montarMensagem(['🧪 <b>[TESTE] Notificação do Orbia</b>', 'Mensagem de verificação enviada pelas Configurações do sistema. Pode ignorar.', `Enviado por: ${nomeUsuario.replace(/[<>&]/g, '')}`]))
}

function tipoLabel(tipo: string) {
  return (TIPO_CHAMADO_LABELS as Record<string, string>)[tipo] || tipo
}

function formatarDataHora(data: Date) {
  const dataStr = data.toLocaleDateString('pt-BR')
  const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dataStr} às ${horaStr}`
}

function formatarDuracao(totalMinutos: number) {
  const h = Math.floor(totalMinutos / 60)
  const m = totalMinutos % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

/** Texto digitado por pessoas (cliente, relato, material) entra no HTML do Telegram: "<", ">" e "&" precisam ser escapados. */
export const esc = (t: string | null | undefined) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function campo(emoji: string, label: string, valor: string) {
  return `${emoji} <b>${label}:</b> ${esc(valor)}`
}

// Junta blocos de linhas com exatamente uma linha em branco entre cada
// bloco nao-vazio - garante o mesmo espacamento visual em toda mensagem
// enviada ao Telegram, independente do tipo de notificacao.
function montarMensagem(blocos: Array<string | string[] | null | undefined | false>): string {
  const linhas: string[] = []
  for (const bloco of blocos) {
    if (bloco == null || bloco === false || bloco === '') continue
    if (Array.isArray(bloco)) {
      if (bloco.length === 0) continue
      linhas.push(...bloco)
    } else {
      linhas.push(bloco)
    }
    linhas.push('')
  }
  while (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop()
  return linhas.join('\n')
}

async function enviarFoto(chatId: string, fotoUrl: string, legenda?: string) {
  if (!BOT_TOKEN || !chatId) return
  try {
    const caminhoRelativo = fotoUrl.startsWith('/') ? fotoUrl.slice(1) : fotoUrl
    const caminhoArquivo = join(process.cwd(), 'public', caminhoRelativo)
    const buffer = await readFile(caminhoArquivo)
    const nomeArquivo = caminhoArquivo.split(/[\\/]/).pop() || 'foto.jpg'

    const formData = new FormData()
    formData.append('chat_id', chatId)
    if (legenda) formData.append('caption', legenda)
    formData.append('parse_mode', 'HTML')
    formData.append('photo', new Blob([buffer]), nomeArquivo)

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const erro = await res.text()
      console.error('Telegram sendPhoto falhou:', res.status, erro)
    }
  } catch (error) {
    console.error('Erro ao enviar foto Telegram:', error)
  }
}

async function enviarFotoBuffer(chatId: string, buffer: Buffer, nomeArquivo: string, legenda?: string) {
  if (!BOT_TOKEN || !chatId) return
  try {
    const formData = new FormData()
    formData.append('chat_id', chatId)
    if (legenda) formData.append('caption', legenda)
    formData.append('parse_mode', 'HTML')
    formData.append('photo', new Blob([new Uint8Array(buffer)]), nomeArquivo)

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const erro = await res.text()
      console.error('Telegram sendPhoto (buffer) falhou:', res.status, erro)
    }
  } catch (error) {
    console.error('Erro ao enviar foto (buffer) Telegram:', error)
  }
}

export async function notificarNovoChamado(chamado: {
  cliente: string
  endereco: string
  numero?: string | null
  complemento?: string | null
  condominio?: string | null
  bloco?: string | null
  apartamento?: string | null
  bairro?: string | null
  cidade: string
  uf?: string | null
  cep?: string | null
  tipo: string
  equipe?: string
  prioridade?: string
  eace?: boolean
  escolaResponsavel?: string | null
  escolaCodigoInep?: string | null
  latitude?: number | null
  longitude?: number | null
}) {
  const prioridade = chamado.prioridade === 'CRITICO' ? '🔴 Crítico' : chamado.prioridade === 'URGENTE' ? '🟡 Urgente' : null
  const enderecoCompleto = formatarEnderecoCompleto(chamado)
  const coordenadasLink = chamado.latitude != null && chamado.longitude != null
    ? `https://www.google.com/maps?q=${chamado.latitude},${chamado.longitude}`
    : null

  const texto = chamado.eace
    ? montarMensagem([
        `🏫 <b>NOVO CHAMADO EACE</b>`,
        [
          campo('👥', 'Equipe', chamado.equipe || 'A definir'),
          campo('🏫', 'Escola', chamado.cliente),
          chamado.escolaResponsavel ? campo('👤', 'Responsável', chamado.escolaResponsavel) : null,
          chamado.escolaCodigoInep ? campo('🔢', 'Código INEP', chamado.escolaCodigoInep) : null,
          campo('📍', 'Localização', enderecoCompleto),
          coordenadasLink ? campo('🗺️', 'Coordenadas', coordenadasLink) : null,
          campo('🔧', 'Tipo', tipoLabel(chamado.tipo)),
          prioridade ? campo('⚠️', 'Prioridade', prioridade) : null,
        ].filter(Boolean) as string[],
        [
          `📱 <i>Acesse o sistema para visualizar e iniciar o atendimento.</i>`,
          `🔗 http://10.10.86.240:3000`,
        ],
      ])
    : montarMensagem([
        `🔵 <b>NOVO CHAMADO DISPONÍVEL</b>`,
        [
          campo('👥', 'Equipe', chamado.equipe || 'A definir'),
          campo('👤', 'Cliente', chamado.cliente),
          campo('📍', 'Endereço', enderecoCompleto),
          campo('🔧', 'Tipo', tipoLabel(chamado.tipo)),
          prioridade ? campo('⚠️', 'Prioridade', prioridade) : null,
        ].filter(Boolean) as string[],
        [
          `📱 <i>Acesse o sistema para visualizar e iniciar o atendimento.</i>`,
          `🔗 http://10.10.86.240:3000`,
        ],
      ])

  await enviarMensagem(GROUP_OS!, texto)
}

export async function notificarAgendaDoDia(
  chamados: Array<{
    cliente: string
    endereco: string
    numero?: string | null
    complemento?: string | null
    condominio?: string | null
    bloco?: string | null
    apartamento?: string | null
    bairro?: string | null
    cidade: string
    uf?: string | null
    cep?: string | null
    tipo: string
    equipe?: string | null
    horaAgendada?: string | null
  }>,
  dataLabel: string
) {
  if (chamados.length === 0) {
    const texto = montarMensagem([
      `🌅 <b>AGENDA DE AMANHÃ — ${dataLabel}</b>`,
      `✅ <b>Nenhum chamado agendado para amanhã.</b>`,
      `🔗 http://10.10.86.240:3000`,
    ])
    await enviarMensagem(GROUP_OS!, texto)
    return
  }

  try {
    const imagem = await gerarImagemAgenda(
      chamados.map(c => ({ cliente: c.cliente, tipo: c.tipo, equipe: c.equipe, horaAgendada: c.horaAgendada })),
      dataLabel
    )
    const legenda = montarMensagem([
      `🌅 <b>AGENDA DE AMANHÃ — ${dataLabel}</b>`,
      `📋 <i>${chamados.length} chamado(s) agendado(s) - recebidos pelo plantão após as 18h.</i>`,
      `🔗 http://10.10.86.240:3000`,
    ])
    await enviarFotoBuffer(GROUP_OS!, imagem, `agenda-${dataLabel.replace(/\//g, '-')}.png`, legenda)
  } catch (error) {
    console.error('Erro ao gerar imagem da agenda, enviando texto como fallback:', error)
    const itens = chamados.map((c, i) => [
      `<b>${i + 1}. ${esc(c.cliente)}</b>`,
      campo('👥', 'Equipe', c.equipe || 'A definir'),
      campo('🔧', 'Tipo', tipoLabel(c.tipo)),
      campo('🕐', 'Início', c.horaAgendada || '07:30'),
    ])
    const texto = montarMensagem([
      `🌅 <b>AGENDA DE AMANHÃ — ${dataLabel}</b>`,
      ...itens,
      `🔗 http://10.10.86.240:3000`,
    ])
    await enviarMensagem(GROUP_OS!, texto)
  }
}

export async function notificarACaminho(chamado: {
  cliente: string
  cidade: string
  equipe?: string
}) {
  const texto = montarMensagem([
    `🔵 <b>EQUIPE A CAMINHO</b>`,
    [
      campo('👥', 'Equipe', chamado.equipe || '—'),
      campo('👤', 'Cliente', chamado.cliente),
      campo('📍', 'Cidade', chamado.cidade),
    ],
    `🕐 Deslocamento iniciado agora.`,
  ])

  await enviarMensagem(GROUP_OS!, texto)
}

export async function notificarReagendamento(chamado: {
  cliente: string
  cidade: string
  tipo: string
  equipe?: string | null
  novaData: Date
}) {
  const texto = montarMensagem([
    `🔵 <b>CHAMADO REAGENDADO</b>`,
    [
      campo('👥', 'Equipe', chamado.equipe || 'A definir'),
      campo('👤', 'Cliente', chamado.cliente),
      campo('📍', 'Cidade', chamado.cidade),
      campo('🔧', 'Tipo', tipoLabel(chamado.tipo)),
      campo('🕐', 'Novo horário', formatarDataHora(chamado.novaData)),
    ],
    `📅 O atendimento foi remarcado e passa a aparecer na agenda no novo horário.`,
  ])

  await enviarMensagem(GROUP_OS!, texto)
}

export async function notificarInicioAtendimento(chamado: {
  cliente: string
  cidade: string
  tipo: string
  equipe?: string
}) {
  const texto = montarMensagem([
    `🟡 <b>ATENDIMENTO INICIADO</b>`,
    [
      campo('👥', 'Equipe', chamado.equipe || '—'),
      campo('👤', 'Cliente', chamado.cliente),
      campo('📍', 'Cidade', chamado.cidade),
      campo('🔧', 'Tipo', tipoLabel(chamado.tipo)),
    ],
    `🕐 <b>Status:</b> Atendimento em andamento...`,
  ])

  await enviarMensagem(GROUP_OS!, texto)
}

interface ResumoDiagnostico {
  downloadMbps?: number | null
  uploadMbps?: number | null
  latenciaGtsnetMs?: number | null
  latenciaExternaMs?: number | null
  jitterMs?: number | null
  perdaPct?: number | null
  sinalRxDbm?: number | null
  onuStatus?: string | null
}

interface DadosDiagnostico {
  fase: 'ANTES' | 'DEPOIS'
  classificacao: Classificacao
  origemProvavel: OrigemProvavel
  recomendacoes?: string[] | null
  resumo?: ResumoDiagnostico | null
  problemaEncontrado?: string | null
  acaoRealizada?: string | null
  resultadoFinal?: string | null
  resumoAnterior?: ResumoDiagnostico | null
}

function formatarMetrica(valor: number | null | undefined, unidade: string, casas = 0) {
  return valor == null ? '-' : `${valor.toFixed(casas)}${unidade}`
}

function montarBlocoDiagnostico(d: DadosDiagnostico): string[] {
  const linhas: string[] = []
  linhas.push(`🔧 <b>DIAGNÓSTICO TÉCNICO DE CONEXÃO</b>`)
  linhas.push(`${CLASSIFICACAO_EMOJI[d.classificacao]} <b>${CLASSIFICACAO_LABEL[d.classificacao]}</b> — Origem provável: <b>${ORIGEM_LABEL[d.origemProvavel]}</b>`)

  if (d.resumo) {
    const r = d.resumo
    linhas.push(``)
    linhas.push(`📊 <b>Resultados da medição:</b>`)
    linhas.push(`• Download: ${formatarMetrica(r.downloadMbps, ' Mbps')} | Upload: ${formatarMetrica(r.uploadMbps, ' Mbps')}`)
    linhas.push(`• Latência GTSNET: ${formatarMetrica(r.latenciaGtsnetMs, ' ms')} | Externa: ${formatarMetrica(r.latenciaExternaMs, ' ms')}`)
    linhas.push(`• Jitter: ${formatarMetrica(r.jitterMs, ' ms')} | Perda de pacotes: ${formatarMetrica(r.perdaPct, '%', 1)}`)
    linhas.push(`• Sinal óptico (RX): ${formatarMetrica(r.sinalRxDbm, ' dBm', 1)}${r.onuStatus ? ` | ONU: ${r.onuStatus}` : ''}`)
  }

  if (d.resumoAnterior && d.resumo) {
    const a = d.resumoAnterior
    const dp = d.resumo
    linhas.push(``)
    linhas.push(`🔄 <b>Comparação Antes × Depois:</b>`)
    linhas.push(`• Download: ${formatarMetrica(a.downloadMbps, ' Mbps')} → ${formatarMetrica(dp.downloadMbps, ' Mbps')}`)
    linhas.push(`• Latência: ${formatarMetrica(a.latenciaGtsnetMs, ' ms')} → ${formatarMetrica(dp.latenciaGtsnetMs, ' ms')}`)
    linhas.push(`• Perda: ${formatarMetrica(a.perdaPct, '%', 1)} → ${formatarMetrica(dp.perdaPct, '%', 1)}`)
  }

  if (d.recomendacoes && d.recomendacoes.length > 0) {
    linhas.push(``)
    linhas.push(`💡 <b>Recomendações:</b>`)
    d.recomendacoes.forEach(rec => linhas.push(`☐ ${rec}`))
  }

  if (d.problemaEncontrado || d.acaoRealizada || d.resultadoFinal) {
    linhas.push(``)
    linhas.push(`📋 <b>Registro do atendimento (diagnóstico):</b>`)
    if (d.problemaEncontrado) linhas.push(`• Problema encontrado: ${PROBLEMA_ENCONTRADO_LABEL[d.problemaEncontrado] || d.problemaEncontrado}`)
    if (d.acaoRealizada) linhas.push(`• Ação realizada: ${d.acaoRealizada}`)
    if (d.resultadoFinal) linhas.push(`• Resultado: ${RESULTADO_FINAL_LABEL[d.resultadoFinal] || d.resultadoFinal}`)
  }

  return linhas
}

export async function notificarFinalizacao(chamado: {
  cliente: string
  cidade: string
  tipo: string
  equipe?: string
  tecnico?: string
  relato?: string
  tempoMinutos?: number
  fotos?: string[]
  materiaisUtilizados?: { descricao: string; quantidade: number; unidade: string }[]
  diagnostico?: DadosDiagnostico
}) {
  const agora = formatarDataHora(new Date())

  const camposPrincipais = [
    campo('👥', 'Equipe', chamado.equipe || '—'),
    chamado.tecnico ? campo('👨‍🔧', 'Técnico', chamado.tecnico) : null,
    campo('👤', 'Cliente', chamado.cliente),
    campo('📍', 'Cidade', chamado.cidade),
    campo('🔧', 'Tipo', tipoLabel(chamado.tipo)),
    campo('⏱️', 'Concluído em', agora),
    chamado.tempoMinutos && chamado.tempoMinutos > 0 ? campo('⏳', 'Tempo total', formatarDuracao(chamado.tempoMinutos)) : null,
  ].filter(Boolean) as string[]

  const blocoObservacao = chamado.relato
    ? [`📝 <b>Observação:</b>`, esc(chamado.relato)]
    : null

  const blocoMateriais = chamado.materiaisUtilizados && chamado.materiaisUtilizados.length > 0
    ? [`📦 <b>Materiais utilizados:</b>`, ...chamado.materiaisUtilizados.map(m => `• ${esc(m.descricao)}: ${m.quantidade} ${esc(m.unidade)}`)]
    : null

  const blocoFotos = chamado.fotos && chamado.fotos.length > 0
    ? campo('📸', 'Evidências', `${chamado.fotos.length} fotografia(s) anexada(s)`)
    : null

  const texto = montarMensagem([
    `🟢 <b>O.S. FINALIZADA</b>`,
    camposPrincipais,
    blocoObservacao,
    blocoMateriais,
    blocoFotos,
    chamado.diagnostico ? montarBlocoDiagnostico(chamado.diagnostico) : null,
    `✅ Ordem de serviço encerrada com sucesso`,
  ])

  // Enviar mensagem de texto primeiro
  const resultado = await enviarMensagem(GROUP_OS!, texto)

  // Enviar fotos uma a uma
  if (chamado.fotos && chamado.fotos.length > 0) {
    for (let i = 0; i < chamado.fotos.length; i++) {
      await enviarFoto(
        GROUP_OS!,
        chamado.fotos[i],
        i === 0 ? `📸 Evidência ${i + 1}/${chamado.fotos.length} — ${esc(chamado.cliente)}` : `📸 Evidência ${i + 1}/${chamado.fotos.length}`
      )
      // Pequena pausa para nao sobrecarregar a API
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return resultado
}