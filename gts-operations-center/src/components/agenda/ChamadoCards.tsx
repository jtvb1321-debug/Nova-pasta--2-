'use client'

import { ArrowRight, BookOpen, CalendarClock, Users } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { numeroOS, lerObservacaoOS } from '@/lib/ordemServico'
import { SeloRechamada } from './CardChamado'
import { SOMBRA_CARD } from '@/components/dashboard/noc/GlassCard'

// Cards da lista de chamados (Central de Chamados): um para chamados gerais e
// outro para EACE. So apresentacao - as acoes ficam no painel "Ver chamado".

const NAO_INFORMADO = 'Não informado'

// Prioridade real do sistema: NORMAL / URGENTE / CRITICO (gravada na observacao).
const PRIORIDADE: Record<string, { rotulo: string; cls: string } | null> = {
  CRITICO: { rotulo: 'Crítico', cls: 'bg-red-500/10 text-red-700' },
  URGENTE: { rotulo: 'Urgente', cls: 'bg-amber-500/15 text-amber-800' },
  NORMAL: { rotulo: 'Normal', cls: 'bg-tema-contraste/[0.05] text-tema-suave' },
}

export function statusDoCard(c: any): { rotulo: string; cls: string; ponto: string } {
  if (c.status === 'ABERTO' && c.equipe?.status === 'DESLOCAMENTO') return { rotulo: 'Em deslocamento', cls: 'bg-blue-500/10 text-blue-700', ponto: 'bg-blue-500' }
  switch (c.status) {
    case 'AGENDADO': return { rotulo: 'Agendado', cls: 'bg-yellow-500/15 text-yellow-800', ponto: 'bg-yellow-500' }
    case 'ABERTO': return { rotulo: 'Aberto', cls: 'bg-tema-contraste/[0.05] text-tema-suave', ponto: 'bg-tema-apagado' }
    case 'EM_ANDAMENTO': return { rotulo: 'Em atendimento', cls: 'bg-orange-500/10 text-orange-700', ponto: 'bg-orange-500' }
    case 'FINALIZADO': return { rotulo: 'Concluído', cls: 'bg-emerald-500/10 text-emerald-700', ponto: 'bg-emerald-500' }
    case 'CANCELADO': return { rotulo: 'Cancelado', cls: 'bg-tema-contraste/[0.05] text-tema-apagado', ponto: 'bg-tema-apagado' }
    default: return { rotulo: c.status, cls: 'bg-tema-contraste/[0.05] text-tema-suave', ponto: 'bg-tema-apagado' }
  }
}

function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-tema-linha bg-tema-superficie p-4 min-w-0" style={{ boxShadow: SOMBRA_CARD }}>
      {children}
    </div>
  )
}

function Cabecalho({ chamado, etiqueta }: { chamado: any; etiqueta: React.ReactNode }) {
  const prioridade = PRIORIDADE[lerObservacaoOS(chamado.observacao).prioridade]
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {etiqueta}
        <span className="font-mono text-xs text-tema-apagado">{numeroOS(chamado.id)}</span>
        <SeloRechamada chamado={chamado} className="text-[10px] font-semibold px-1.5 py-px rounded" />
      </div>
      {prioridade && (
        <span className={cn('flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full', prioridade.cls)}>{prioridade.rotulo}</span>
      )}
    </div>
  )
}

function Rodape({ chamado, onVer }: { chamado: any; onVer: () => void }) {
  const status = statusDoCard(chamado)
  return (
    <div className="mt-auto pt-3 border-t border-tema-linha flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tema-suave">
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <Users className="w-3.5 h-3.5 flex-shrink-0 text-orange-600" aria-hidden />
        <span className="truncate">{chamado.equipe?.nome ?? 'Sem equipe'}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 flex-shrink-0 text-orange-600" aria-hidden />
        {chamado.dataAgendada ? formatDate(chamado.dataAgendada, "dd/MM, HH:mm") : 'Não agendado'}
      </span>
      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium', status.cls)}>
        <span className={cn('w-1.5 h-1.5 rounded-full', status.ponto)} aria-hidden />
        {status.rotulo}
      </span>
      <button
        type="button"
        onClick={onVer}
        className="ml-auto inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
      >
        Ver chamado <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  )
}

function Dado({ rotulo, children, mono }: { rotulo: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-xs min-w-0">
      <span className="w-[72px] flex-shrink-0 text-tema-apagado">{rotulo}</span>
      <span className={cn('min-w-0 break-words text-tema-tinta', mono && 'font-mono')}>{children}</span>
    </div>
  )
}

export function CardChamadoGeral({ chamado, onVer }: { chamado: any; onVer: () => void }) {
  const tipo = TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado] || chamado.tipo
  const endereco = [
    [chamado.endereco, chamado.numero].filter(Boolean).join(', '),
    chamado.bairro,
    chamado.cidade,
  ].filter(Boolean).join(' · ')

  return (
    <Cartao>
      <Cabecalho
        chamado={chamado}
        etiqueta={<span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-tema-contraste/[0.05] text-tema-suave">{tipo}</span>}
      />
      <h3 className="mt-2 text-base font-bold text-tema-tinta break-words">{chamado.cliente}</h3>
      <p className="mt-1 mb-4 text-xs text-tema-suave break-words">{endereco || NAO_INFORMADO}</p>
      <Rodape chamado={chamado} onVer={onVer} />
    </Cartao>
  )
}

export function CardChamadoEace({ chamado, onVer }: { chamado: any; onVer: () => void }) {
  // Falha informada no despacho; chamados antigos sem o rotulo "Falha:" mostram o texto das observacoes.
  const { falha: falhaInformada, observacao } = lerObservacaoOS(chamado.observacao)
  const falha = falhaInformada || observacao
  return (
    <Cartao>
      <Cabecalho
        chamado={chamado}
        etiqueta={
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-700">
            <BookOpen className="w-3 h-3" aria-hidden /> EACE
          </span>
        }
      />
      <h3 className="mt-2 text-base font-bold text-tema-tinta break-words">{chamado.cliente}</h3>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <Dado rotulo="INEP:" mono>{chamado.escolaCodigoInep || NAO_INFORMADO}</Dado>
        <Dado rotulo="Responsável:">{chamado.escolaResponsavel || NAO_INFORMADO}</Dado>
        <Dado rotulo="Cidade:">{chamado.cidade || NAO_INFORMADO}</Dado>
        <Dado rotulo="Tel. Escola:">{chamado.telefone || NAO_INFORMADO}</Dado>
      </div>

      <div className="mt-3 mb-4 flex gap-2 text-xs">
        <span className="w-[72px] flex-shrink-0 font-semibold text-tema-tinta">Falha:</span>
        <span className="min-w-0 text-tema-suave break-words line-clamp-2" title={falha || undefined}>{falha || NAO_INFORMADO}</span>
      </div>

      <Rodape chamado={chamado} onVer={onVer} />
    </Cartao>
  )
}
