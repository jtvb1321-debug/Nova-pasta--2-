import { prisma } from './prisma'

// Fuso configurado em Configuracoes (chave "sistema_timezone"); sem registro
// vale o padrao da tela de configuracoes.
export const FUSO_PADRAO = 'America/Sao_Paulo'

export async function fusoDoSistema(): Promise<string> {
  try {
    const cfg = await prisma.configuracao.findUnique({ where: { chave: 'sistema_timezone' } })
    const fuso = cfg?.valor?.trim()
    if (fuso) {
      // Valida: um nome de fuso invalido derrubaria o Intl.
      new Intl.DateTimeFormat('pt-BR', { timeZone: fuso })
      return fuso
    }
  } catch {
    // cai no padrao
  }
  return FUSO_PADRAO
}

function partes(data: Date, fuso: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(data)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return p
}

// Diferenca (ms) entre a hora local do fuso e o UTC no instante dado.
function deslocamentoMs(data: Date, fuso: string) {
  const p = partes(data, fuso)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(data.getTime() / 1000) * 1000
}

// Instante (UTC) em que o dia de `agora` comecou no fuso informado.
export function inicioDoDia(fuso: string, agora = new Date()): Date {
  const p = partes(agora, fuso)
  const meiaNoiteComoUtc = Date.UTC(p.year, p.month - 1, p.day)
  let instante = meiaNoiteComoUtc - deslocamentoMs(new Date(meiaNoiteComoUtc), fuso)
  // Ajuste fino (mudanca de horario entre a meia-noite e o palpite).
  instante = meiaNoiteComoUtc - deslocamentoMs(new Date(instante), fuso)
  return new Date(instante)
}
