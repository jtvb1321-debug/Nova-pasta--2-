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
    const baseUrl = process.env.NEXTAUTH_URL || 'http://10.10.86.240:3000'
    const urlCompleta = fotoUrl.startsWith('http') ? fotoUrl : `${baseUrl}${fotoUrl}`

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: urlCompleta,
        caption: legenda || '',
        parse_mode: 'HTML',
      }),
    })
  } catch (error) {
    console.error('Erro ao enviar foto Telegram:', error)
  }
}

export async function notificarNovoChamado(chamado: {
  cliente: string
  endereco: string
  cidade: string
  tipo: string
  equipe?: string
  prioridade?: string
}) {
  const tipo = { INSTALACAO: 'Instalacao', MANUTENCAO: 'Manutencao', RETIRADA: 'Retirada', SUPORTE: 'Suporte' }[chamado.tipo] || chamado.tipo
  const prioridade = chamado.prioridade === 'CRITICO' ? '🔴 CRITICO' : chamado.prioridade === 'URGENTE' ? '🟡 URGENTE' : ''

  const texto = [
    `📲 <b>NOVO CHAMADO DISPONIVEL</b>`,
    ``,
    `👥 <b>Equipe:</b> ${chamado.equipe || 'A definir'}`,
    `👤 <b>Cliente:</b> ${chamado.cliente}`,
    `📍 <b>Endereco:</b> ${chamado.endereco}`,
    `🏙️ <b>Cidade:</b> ${chamado.cidade}`,
    `🔧 <b>Tipo:</b> ${tipo}`,
    prioridade ? `⚠️ <b>Prioridade:</b> ${prioridade}` : '',
    ``,
    `📱 <i>Acesse o sistema para visualizar e iniciar o atendimento.</i>`,
    `🔗 http://10.10.86.240:3000`,
  ].filter(Boolean).join('\n')

  await enviarMensagem(GROUP_OS!, texto)
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