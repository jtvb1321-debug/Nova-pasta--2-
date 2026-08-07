import fs from 'fs'
import path from 'path'

export async function register() {
  const logPath = path.join(process.cwd(), 'whatsapp-debug.log')
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] instrumentation register() chamado. NEXT_RUNTIME=${process.env.NEXT_RUNTIME}\n`)

  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { iniciarWhatsApp } = await import('./src/lib/whatsapp')
    iniciarWhatsApp()

    const { iniciarAgendaDiaria } = await import('./src/lib/agendaDiariaJob')
    iniciarAgendaDiaria()
  }
}