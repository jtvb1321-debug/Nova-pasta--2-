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
  const tipo = { INSTALACAO: 'Instalacao', MANUTENCAO: 'Manutencao', RETIRADA: 'Retirada', SUPORTE: 'Suporte' }[chamado.tipo] || chamado.tipo
  const prioridade = chamado.prioridade === 'CRITICO' ? '🔴 CRITICO' : chamado.prioridade === 'URGENTE' ? '🟡 URGENTE' : ''
  const enderecoCompleto = formatarEnderecoCompleto(chamado)

  const texto = [
    `📲 <b>NOVO CHAMADO DISPONIVEL</b>`,
    ``,
    `👥 <b>Equipe:</b> ${chamado.equipe || 'A definir'}`,
    `👤 <b>Cliente:</b> ${chamado.cliente}`,
    `📍 <b>Endereco:</b> ${enderecoCompleto}`,
    `🔧 <b>Tipo:</b> ${tipo}`,
    prioridade ? `⚠️ <b>Prioridade:</b> ${prioridade}` : '',
    ``,
    `📱 <i>Acesse o sistema para visualizar e iniciar o atendimento.</i>`,
    `🔗 http://10.10.86.240:3000`,
  ].filter(Boolean).join('\n')

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
  const tipoLabel: Record<string, string> = { INSTALACAO: 'Instalacao', MANUTENCAO: 'Manutencao', RETIRADA: 'Retirada', SUPORTE: 'Suporte' }

  const linhas = [
    `🌅 <b>AGENDA DE AMANHA - ${dataLabel}</b>`,
    ``,
    `📋 <i>Chamados recebidos pelo plantao apos as 18h, agendados automaticamente para inicio 07:30.</i>`,
    ``,
  ]

  if (chamados.length === 0) {
    linhas.push(`✅ <b>Nenhum chamado agendado para amanha.</b>`)
  } else {
    chamados.forEach((c, i) => {
      const enderecoCompleto = formatarEnderecoCompleto(c)
      linhas.push(
        `<b>${i + 1}. ${c.cliente}</b>`,
        `   👥 Equipe: ${c.equipe || 'A definir'}`,
        `   🔧 Tipo: ${tipoLabel[c.tipo] || c.tipo}`,
        `   📍 ${enderecoCompleto}`,
        `   🕐 Inicio: ${c.horaAgendada || '07:30'}`,
        ``
      )
    })
  }

  linhas.push(`🔗 http://10.10.86.240:3000`)

  await enviarMensagem(GROUP_OS!, linhas.filter(Boolean).join('\n'))
}

export async function notificarACaminho(chamado: {
  cliente: string
  cidade: string
  equipe?: string
}) {
  const texto = [
    `🚗 <b>EQUIPE A CAMINHO</b>`,
    ``,
    `👥 <b>Equipe:</b> ${chamado.equipe || '—'}`,
    `👤 <b>Cliente:</b> ${chamado.cliente}`,
    `🏙️ <b>Cidade:</b> ${chamado.cidade}`,
    ``,
    `⏱️ <i>Deslocamento iniciado agora.</i>`,
  ].filter(Boolean).join('\n')

  await enviarMensagem(GROUP_OS!, texto)
}

export async function notificarInicioAtendimento(chamado: {
  cliente: string
  cidade: string
  tipo: string
  equipe?: string
}) {
  const tipo = { INSTALACAO: 'Instalacao', MANUTENCAO: 'Manutencao', RETIRADA: 'Retirada', SUPORTE: 'Suporte' }[chamado.tipo] || chamado.tipo

  const texto = [
    `🔧 <b>ATENDIMENTO INICIADO</b>`,
    ``,
    `👥 <b>Equipe:</b> ${chamado.equipe || '—'}`,
    `👤 <b>Cliente:</b> ${chamado.cliente}`,
    `🏙️ <b>Cidade:</b> ${chamado.cidade}`,
    `🔧 <b>Tipo:</b> ${tipo}`,
    ``,
    `⏳ <i>Atendimento em andamento...</i>`,
  ].filter(Boolean).join('\n')

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
  linhas.push(``)
  linhas.push(`🔧 <b>DIAGNOSTICO TECNICO DE CONEXAO</b>`)
  linhas.push(`${CLASSIFICACAO_EMOJI[d.classificacao]} <b>${CLASSIFICACAO_LABEL[d.classificacao]}</b> — Origem provavel: <b>${ORIGEM_LABEL[d.origemProvavel]}</b>`)

  if (d.resumo) {
    const r = d.resumo
    linhas.push(``)
    linhas.push(`📊 <b>Resultados da medicao:</b>`)
    linhas.push(`  • Download: ${formatarMetrica(r.downloadMbps, ' Mbps')} | Upload: ${formatarMetrica(r.uploadMbps, ' Mbps')}`)
    linhas.push(`  • Latencia GTSNET: ${formatarMetrica(r.latenciaGtsnetMs, ' ms')} | Externa: ${formatarMetrica(r.latenciaExternaMs, ' ms')}`)
    linhas.push(`  • Jitter: ${formatarMetrica(r.jitterMs, ' ms')} | Perda de pacotes: ${formatarMetrica(r.perdaPct, '%', 1)}`)
    linhas.push(`  • Sinal optico (RX): ${formatarMetrica(r.sinalRxDbm, ' dBm', 1)}${r.onuStatus ? ` | ONU: ${r.onuStatus}` : ''}`)
  }

  if (d.resumoAnterior && d.resumo) {
    const a = d.resumoAnterior
    const dp = d.resumo
    linhas.push(``)
    linhas.push(`🔄 <b>Comparacao Antes x Depois:</b>`)
    linhas.push(`  • Download: ${formatarMetrica(a.downloadMbps, ' Mbps')} → ${formatarMetrica(dp.downloadMbps, ' Mbps')}`)
    linhas.push(`  • Latencia: ${formatarMetrica(a.latenciaGtsnetMs, ' ms')} → ${formatarMetrica(dp.latenciaGtsnetMs, ' ms')}`)
    linhas.push(`  • Perda: ${formatarMetrica(a.perdaPct, '%', 1)} → ${formatarMetrica(dp.perdaPct, '%', 1)}`)
  }

  if (d.recomendacoes && d.recomendacoes.length > 0) {
    linhas.push(``)
    linhas.push(`💡 <b>Recomendacoes:</b>`)
    d.recomendacoes.forEach(rec => linhas.push(`  ☐ ${rec}`))
  }

  if (d.problemaEncontrado || d.acaoRealizada || d.resultadoFinal) {
    linhas.push(``)
    linhas.push(`📋 <b>Registro do atendimento (diagnostico):</b>`)
    if (d.problemaEncontrado) linhas.push(`  • Problema encontrado: ${PROBLEMA_ENCONTRADO_LABEL[d.problemaEncontrado] || d.problemaEncontrado}`)
    if (d.acaoRealizada) linhas.push(`  • Acao realizada: ${d.acaoRealizada}`)
    if (d.resultadoFinal) linhas.push(`  • Resultado: ${RESULTADO_FINAL_LABEL[d.resultadoFinal] || d.resultadoFinal}`)
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
  const tipo = { INSTALACAO: 'Instalacao', MANUTENCAO: 'Manutencao', RETIRADA: 'Retirada', SUPORTE: 'Suporte' }[chamado.tipo] || chamado.tipo
  const agora = new Date().toLocaleString('pt-BR')

  const linhas = [
    `✅ <b>O.S. FINALIZADA</b>`,
    ``,
    `👥 <b>Equipe:</b> ${chamado.equipe || '—'}`,
    chamado.tecnico ? `👨‍🔧 <b>Tecnico:</b> ${chamado.tecnico}` : '',
    `👤 <b>Cliente:</b> ${chamado.cliente}`,
    `🏙️ <b>Cidade:</b> ${chamado.cidade}`,
    `🔧 <b>Tipo:</b> ${tipo}`,
    `🕒 <b>Concluido em:</b> ${agora}`,
  ]

  if (chamado.tempoMinutos && chamado.tempoMinutos > 0) {
    const h = Math.floor(chamado.tempoMinutos / 60)
    const m = chamado.tempoMinutos % 60
    linhas.push(`⏱️ <b>Tempo total:</b> ${h > 0 ? `${h}h ` : ''}${m}min`)
  }

  if (chamado.relato) {
    linhas.push(``)
    linhas.push(`📝 <b>Observacao do atendimento:</b>`)
    linhas.push(`<i>${chamado.relato}</i>`)
  }

  if (chamado.materiaisUtilizados && chamado.materiaisUtilizados.length > 0) {
    linhas.push(``)
    linhas.push(`📦 <b>Materiais utilizados:</b>`)
    chamado.materiaisUtilizados.forEach(m => {
      linhas.push(`  • ${m.descricao}: ${m.quantidade} ${m.unidade}`)
    })
  }

  if (chamado.fotos && chamado.fotos.length > 0) {
    linhas.push(``)
    linhas.push(`📸 <b>${chamado.fotos.length} evidencia(s) fotografica(s) anexada(s)</b>`)
  }

  if (chamado.diagnostico) {
    linhas.push(...montarBlocoDiagnostico(chamado.diagnostico))
  }

  linhas.push(``)
  linhas.push(`🎯 <i>Ordem de servico encerrada com sucesso.</i>`)

  // Enviar mensagem de texto primeiro
  await enviarMensagem(GROUP_OS!, linhas.filter(Boolean).join('\n'))

  // Enviar fotos uma a uma
  if (chamado.fotos && chamado.fotos.length > 0) {
    for (let i = 0; i < chamado.fotos.length; i++) {
      await enviarFoto(
        GROUP_OS!,
        chamado.fotos[i],
        i === 0 ? `📸 Evidencia ${i + 1}/${chamado.fotos.length} — ${chamado.cliente}` : `📸 Evidencia ${i + 1}/${chamado.fotos.length}`
      )
      // Pequena pausa para nao sobrecarregar a API
      await new Promise(r => setTimeout(r, 500))
    }
  }
}