// Gestao de Desempenho: agendador em segundo plano (mesmo padrao dos outros jobs: setInterval no servidor).
// Cada minuto decide, em America/Fortaleza: sincronizar (intervalo configuravel), fechar o dia (hora configuravel)
// e consolidar a semana (primeiro dia apos o fim da semana). Tudo idempotente: repetir nao duplica nada.

import { prisma } from '@/lib/prisma'
import { diaDe, inicioDaSemana, somarDias } from './periodos'
import { lerConfig } from './config'
import { sincronizar, sincronizacaoEmAndamento } from './sincronizacao'
import { gerarRelatorio, periodoEncerrado } from './relatorios'

const TAG = '[GestaoDesempenho]'
let timer: ReturnType<typeof setInterval> | null = null
let ultimaSync = 0
let ultimoFechamento: string | null = null

/** Gera os relatorios do dia (4 unidades + consolidado) e, na virada da semana, o semanal. */
export async function fecharDiaESemana(agora = new Date()) {
  const cfg = await lerConfig('sincronizacao')
  const op = await lerConfig('operacao')
  const hoje = diaDe(agora)
  const dia = periodoEncerrado({ inicio: hoje, fim: hoje }, agora, cfg.horaFechamento) ? hoje : somarDias(hoje, -1)
  const unidades = await prisma.gdUnidade.findMany({ where: { ativo: true }, select: { id: true } })
  for (const u of unidades) await gerarRelatorio({ tipo: 'DIARIO_UNIDADE', periodo: { inicio: dia, fim: dia }, unidadeId: u.id, usuario: 'Sistema' })
  if (unidades.length) await gerarRelatorio({ tipo: 'DIARIO_CONSOLIDADO', periodo: { inicio: dia, fim: dia }, usuario: 'Sistema' })

  // Semana: a que terminou antes de hoje (a que contem "dia" so fecha no dia seguinte ao seu ultimo dia).
  const iniSemanaAtual = inicioDaSemana(dia, op.inicioSemana)
  const iniAnterior = somarDias(iniSemanaAtual, -7)
  if (unidades.length) await gerarRelatorio({ tipo: 'SEMANAL', periodo: { inicio: iniAnterior, fim: somarDias(iniAnterior, 6) }, usuario: 'Sistema' })
}

async function tick() {
  try {
    const agora = new Date()
    const cfg = await lerConfig('sincronizacao')
    if (!sincronizacaoEmAndamento() && agora.getTime() - ultimaSync >= cfg.intervaloMinutos * 60_000) {
      ultimaSync = agora.getTime()
      const r = await sincronizar({ modo: 'AUTOMATICA' })
      if (r.opa.status === 'FALHA') console.error(`${TAG} OPA indisponível: ${r.opa.mensagem}`)
    }
    // Fechamento diario: uma vez por dia, depois da hora configurada.
    const hoje = diaDe(agora)
    if (ultimoFechamento !== hoje && periodoEncerrado({ inicio: hoje, fim: hoje }, agora, cfg.horaFechamento)) {
      await fecharDiaESemana(agora)
      ultimoFechamento = hoje
    }
  } catch (e) {
    console.error(`${TAG} erro no ciclo:`, e instanceof Error ? e.message : e)
  }
}

export function iniciarGestaoDesempenho() {
  // Desligado por padrao: so roda com GESTAO_DESEMPENHO_ATIVO=true (depois de aplicar o SQL e configurar o modulo).
  if (process.env.GESTAO_DESEMPENHO_ATIVO !== "true") return
  if (timer) return
  // Primeira rodada um pouco depois do arranque (o servidor ainda esta subindo).
  setTimeout(() => { void tick() }, 60_000)
  timer = setInterval(() => { void tick() }, 60_000)
  console.log(`${TAG} agendador iniciado (America/Fortaleza).`)
}
