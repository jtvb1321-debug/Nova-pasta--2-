import { readFile } from 'fs/promises'
import { join } from 'path'
import { formatarEnderecoCompleto } from './utils'
import {
  CLASSIFICACAO_LABEL, CLASSIFICACAO_EMOJI, ORIGEM_LABEL,
  PROBLEMA_ENCONTRADO_LABEL, RESULTADO_FINAL_LABEL,
  type Classificacao, type OrigemProvavel,
} from './diagnosticoEngine'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const GROUP_OS  = process.env.TELEGRAM_GROUP_OS

async function enviarMensagem(chatId: string, texto: string) {
  if (!BOT_TOKEN || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: 'HTML',
      }),
    })
  } catch (error) {
    console.error('Erro Telegram:', error)
  }
}

const TIPO_LABEL: Record<string, string> = {
  INSTALACAO: 'Instalação',
  MANUTENCAO: 'Manutenção',
  RETIRADA: 'Retirada',
  SUPORTE: 'Suporte',
  ROMPIMENTO_MASSIVO: 'Rompimento Massivo',
}

function tipoLabel(tipo: string) {
  return TIPO_LABEL[tipo] || tipo
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

function campo(emoji: string, label: string, valor: string) {
  return `${emoji} <b>${label}:</b> ${valor}`
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
}) {
  const prioridade = chamado.prioridade === 'CRITICO' ? '🔴 Crítico' : chamado.prioridade === 'URGENTE' ? '🟡 Urgente' : null
  const enderecoCompleto = formatarEnderecoCompleto(chamado)

  const texto = montarMensagem([
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
  const itens = chamados.length === 0
    ? [[`✅ <b>Nenhum chamado agendado para amanhã.</b>`]]
    : chamados.map((c, i) => [
        `<b>${i + 1}. ${c.cliente}</b>`,
        campo('👥', 'Equipe', c.equipe || 'A definir'),
        campo('🔧', 'Tipo', tipoLabel(c.tipo)),
        `📍 ${formatarEnderecoCompleto(c)}`,
        campo('🕐', 'Início', c.horaAgendada || '07:30'),
      ])

  const texto = montarMensagem([
    `🌅 <b>AGENDA DE AMANHÃ — ${dataLabel}</b>`,
    `📋 <i>Chamados recebidos pelo plantão após as 18h, agendados automaticamente para início às 07:30.</i>`,
    ...itens,
    `🔗 http://10.10.86.240:3000`,
  ])

  await enviarMensagem(GROUP_OS!, texto)
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
    ? [`📝 <b>Observação:</b>`, chamado.relato]
    : null

  const blocoMateriais = chamado.materiaisUtilizados && chamado.materiaisUtilizados.length > 0
    ? [`📦 <b>Materiais utilizados:</b>`, ...chamado.materiaisUtilizados.map(m => `• ${m.descricao}: ${m.quantidade} ${m.unidade}`)]
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
  await enviarMensagem(GROUP_OS!, texto)

  // Enviar fotos uma a uma
  if (chamado.fotos && chamado.fotos.length > 0) {
    for (let i = 0; i < chamado.fotos.length; i++) {
      await enviarFoto(
        GROUP_OS!,
        chamado.fotos[i],
        i === 0 ? `📸 Evidência ${i + 1}/${chamado.fotos.length} — ${chamado.cliente}` : `📸 Evidência ${i + 1}/${chamado.fotos.length}`
      )
      // Pequena pausa para nao sobrecarregar a API
      await new Promise(r => setTimeout(r, 500))
    }
  }
}