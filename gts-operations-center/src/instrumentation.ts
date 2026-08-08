export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const fs = await import('fs')
    const path = await import('path')
    const logPath = path.join(process.cwd(), 'whatsapp-debug.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] instrumentation register() chamado. NEXT_RUNTIME=${process.env.NEXT_RUNTIME}\n`)

    const { iniciarWhatsApp } = await import('./lib/whatsapp')
    iniciarWhatsApp()

    const { iniciarAgendaDiaria } = await import('./lib/agendaDiariaJob')
    iniciarAgendaDiaria()
  }
}
