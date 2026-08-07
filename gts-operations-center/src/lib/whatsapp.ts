import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'

const LOG_PATH = path.join(process.cwd(), 'whatsapp-debug.log')

function logWhats(msg: string) {
  const linha = `[${new Date().toISOString()}] ${msg}\n`
  console.log(linha.trim())
  try {
    fs.appendFileSync(LOG_PATH, linha)
  } catch {}
}

let client: Client | null = null
let pronto = false

function getClient() {
  if (client) return client

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    webVersionCache: {
      type: 'none',
    },
    puppeteer: {
      executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    },
  })

  client.on('loading_screen', (percent: number, msg: string) => {
    logWhats(`Carregando WhatsApp Web: ${percent}% - ${msg}`)
  })

  client.on('authenticated', () => {
    logWhats('Autenticado com sucesso! Aguardando ficar pronto...')
    setTimeout(() => {
      if (!pronto) {
        logWhats('AVISO: Passaram-se 45s desde a autenticacao e o cliente ainda nao ficou pronto. Pode ser necessario reiniciar o servidor ou apagar a pasta .wwebjs_auth e escanear o QR Code novamente.')
      }
    }, 45000)
  })

  client.on('change_state', (state: string) => {
    logWhats(`Mudanca de estado: ${state}`)
  })

  client.on('qr', (qr: string) => {
    console.log('\n=== ESCANEIE O QR CODE ABAIXO COM O WHATSAPP DO CELULAR ===')
    console.log('(No celular: WhatsApp > Configuracoes > Aparelhos conectados > Conectar um aparelho)\n')
    qrcode.generate(qr, { small: true })
  })

  client.on('ready', () => {
    pronto = true
    logWhats('Conectado e pronto para enviar mensagens!')
  })

  client.on('disconnected', (motivo: string) => {
    pronto = false
    logWhats(`Desconectado: ${motivo}`)
  })

  client.on('message', async (msg: any) => {
    try {
      if (msg.fromMe || msg.isStatus) return
      const numeroRemetente = String(msg.from || '').split('@')[0].replace(/\D/g, '')
      const texto = (msg.body || '').trim()
      if (!numeroRemetente || !texto) return
      await registrarRespostaFeedback(numeroRemetente, texto)
    } catch (error: any) {
      logWhats(`Erro ao processar mensagem recebida: ${error?.message || error}`)
    }
  })

  client.on('auth_failure', (msg: string) => {
    logWhats(`Falha na autenticacao: ${msg}`)
  })

  client.initialize().catch((err: any) => {
    logWhats(`Erro ao inicializar: ${err}`)
  })

  return client
}

export function iniciarWhatsApp() {
  logWhats('iniciarWhatsApp() chamado - inicializando cliente...')
  getClient()
}

// Tambem inicializa automaticamente ao carregar o modulo, exceto durante o build
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  logWhats(`Modulo whatsapp.ts carregado (NEXT_PHASE=${process.env.NEXT_PHASE}). Iniciando cliente automaticamente...`)
  getClient()
} else {
  logWhats('Modulo whatsapp.ts carregado durante o BUILD - pulando inicializacao.')
}

function formatarTelefone(telefone: string) {
  const somenteNumeros = telefone.replace(/\D/g, '')
  if (somenteNumeros.startsWith('55')) return somenteNumeros
  return `55${somenteNumeros}`
}

// Casa a resposta recebida com o chamado mais recente que teve pedido de
// feedback enviado para aquele numero e ainda nao foi confirmado - assim o
// admin ve a resposta do cliente na aba Feedback antes de fechar o loop.
async function registrarRespostaFeedback(numeroRemetente: string, texto: string) {
  try {
    const limite = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    const candidatos = await prisma.chamado.findMany({
      where: {
        feedbackEnviado: true,
        feedbackConfirmado: false,
        feedbackEnviadoEm: { gte: limite },
        telefone: { not: null },
      },
      orderBy: { feedbackEnviadoEm: 'desc' },
      take: 50,
    })

    const chamado = candidatos.find(c => c.telefone && formatarTelefone(c.telefone) === numeroRemetente)
    if (!chamado) return

    const linhaNova = `[${new Date().toLocaleString('pt-BR')}] ${texto}`
    const respostaCompleta = chamado.feedbackResposta ? `${chamado.feedbackResposta}\n${linhaNova}` : linhaNova

    await prisma.chamado.update({
      where: { id: chamado.id },
      data: { feedbackResposta: respostaCompleta, feedbackRespostaEm: new Date() },
    })

    logWhats(`Resposta de feedback registrada para o chamado ${chamado.id} (${chamado.cliente}): "${texto.slice(0, 80)}"`)
  } catch (error: any) {
    logWhats(`Erro ao registrar resposta de feedback: ${error?.message || error}`)
  }
}

// Retorna true somente quando a mensagem foi de fato enviada. Quem chama e
// precisa saber se realmente saiu (ex: marcar feedbackEnviado) deve checar o retorno -
// antes isso nao existia e chamados eram marcados como "enviados" mesmo falhando.
export async function enviarWhatsApp(telefone: string | null | undefined, mensagem: string): Promise<boolean> {
  logWhats(`enviarWhatsApp() chamado. Telefone recebido: ${telefone}`)

  if (!telefone) {
    logWhats('Nao enviado: telefone vazio/nao informado no chamado.')
    return false
  }
  if (!pronto) {
    logWhats('Nao enviado: cliente ainda nao esta pronto/conectado.')
    return false
  }

  try {
    const numero = formatarTelefone(telefone)
    logWhats(`Numero formatado: ${numero}`)

    const numeroValido = await getClient()!.getNumberId(numero)
    logWhats(`Resultado da validacao do numero: ${JSON.stringify(numeroValido)}`)

    if (!numeroValido) {
      logWhats(`Nao enviado: numero ${numero} nao esta registrado no WhatsApp (ou formato incorreto).`)
      return false
    }

    await getClient()!.sendMessage(numeroValido._serialized, mensagem)
    logWhats(`Mensagem enviada com sucesso para ${numero}`)
    return true
  } catch (error: any) {
    logWhats(`Erro ao enviar mensagem: ${error?.message || error}`)
    return false
  }
}