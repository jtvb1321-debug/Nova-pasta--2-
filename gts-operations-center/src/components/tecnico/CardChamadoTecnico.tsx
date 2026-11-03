'use client'

import { Brain, CalendarClock, ChevronRight, Clock, Loader2, MapPin, MessageCircle, Navigation, Phone, Truck, Zap, CheckCircle } from 'lucide-react'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { numeroOS } from '@/lib/ordemServico'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { CLASSIFICACAO_LABEL } from '@/lib/diagnosticoEngine'
import { ResumoIxc } from './InfoIxc'
import { acaoPrincipal, etapaDoChamado, prioridadeDe, rotuloDaEtapa, situacaoDeTempo, type Etapa } from '@/lib/tecnicoChamado'

const ETAPA_BADGE: Record<Etapa, string> = {
  AGUARDANDO: 'bg-tema-contraste/[0.07] text-tema-suave',
  DESLOCAMENTO: 'bg-amber-400/25 text-amber-800 border border-amber-500/40',
  ATENDIMENTO: 'bg-green-500/15 text-green-800 border border-green-600/30',
  CONCLUIDO: 'bg-emerald-500/10 text-emerald-700',
  OUTRO: 'bg-tema-contraste/[0.07] text-tema-suave',
}

const ICONE_ACAO: Record<string, React.ElementType> = { ABERTO: Truck, EM_ANDAMENTO: Zap, FINALIZADO: CheckCircle }
// Icone junto do texto do status: a etapa nunca depende so da cor.
const ICONE_ETAPA: Partial<Record<Etapa, React.ElementType>> = { AGUARDANDO: Clock, DESLOCAMENTO: Truck, ATENDIMENTO: Zap, CONCLUIDO: CheckCircle }

function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?-?\s?/g, '').replace(/Bairro:.*$/i, '').trim() || ''
}

function agendadoTexto(data: string | Date) {
  const d = new Date(data)
  const hoje = new Date()
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
  const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${hh}`
  if (d.toDateString() === amanha.toDateString()) return `amanhã, ${hh}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hh}`
}

interface Props {
  chamado: any
  agora: number
  destaque?: boolean
  enviando: boolean      // esta acao esta em andamento neste card
  bloqueado: boolean     // existe uma operacao em andamento (qualquer card): evita clique duplo
  onAbrir: () => void
  onAvancar: (status: 'ABERTO' | 'EM_ANDAMENTO') => void
}

export function CardChamadoTecnico({ chamado, agora, destaque = false, enviando, bloqueado, onAbrir, onAvancar }: Props) {
  const etapa = etapaDoChamado(chamado)
  const acao = acaoPrincipal(etapa)
  const prioridade = prioridadeDe(chamado.observacao)
  const tempo = situacaoDeTempo(chamado, agora)
  const endereco = formatarEnderecoCompleto(chamado)
  const obs = limparObservacao(chamado.observacao)
  const digitos = (chamado.telefone ?? '').replace(/\D/g, '')
  const Icone = acao ? ICONE_ACAO[acao.proximoStatus] : null
  const diag = chamado.diagnosticos?.[0]
  const IconeEtapa = ICONE_ETAPA[etapa]

  function clicarAcao(e: React.MouseEvent) {
    e.stopPropagation()
    if (!acao) return
    // Finalizar exige o formulario (relato e fotos): abre os detalhes. As outras etapas avancam direto.
    if (acao.proximoStatus === 'FINALIZADO') onAbrir()
    else onAvancar(acao.proximoStatus)
  }

  const secundario = 'flex-1 min-w-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl border border-tema-linha-forte bg-tema-superficie text-sm font-semibold text-tema-texto hover:bg-tema-contraste/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50'

  return (
    <article
      onClick={onAbrir}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onAbrir() } }}
      role="button"
      tabIndex={0}
      aria-label={`${chamado.cliente}, ${rotuloDaEtapa(etapa)}. Abrir detalhes`}
      className={cn(
        'rounded-xl border bg-tema-superficie p-3.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
        destaque ? (etapa === 'DESLOCAMENTO' ? 'border-amber-500/60 ring-1 ring-amber-500/25' : 'border-green-600/50 ring-1 ring-green-600/20') : prioridade === 'CRITICO' ? 'border-red-500/40' : 'border-tema-linha hover:border-tema-linha-forte',
      )}
      style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-tema-suave">{numeroOS(chamado.id)}</span>
        <span className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold', ETAPA_BADGE[etapa])}>
          {IconeEtapa && <IconeEtapa className="w-3.5 h-3.5" aria-hidden />}{rotuloDaEtapa(etapa)}
        </span>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug text-tema-tinta break-words">{chamado.cliente}</h3>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <span className="text-xs px-2 py-0.5 rounded-full bg-tema-contraste/[0.06] text-tema-texto font-medium">
              {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
            </span>
            {prioridade !== 'NORMAL' && (
              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-semibold', prioridade === 'CRITICO' ? 'text-red-700 bg-red-500/10 border-red-500/30' : 'text-amber-800 bg-amber-500/10 border-amber-500/30')}>
                {prioridade === 'CRITICO' ? 'Crítico' : 'Urgente'}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-tema-apagado flex-shrink-0 mt-0.5" aria-hidden />
      </div>

      {/* Horario marcado e tempos: abertura (informativo) separado do atraso (so quando o prazo estoura) */}
      <div className="mt-3 space-y-0.5 text-xs">
        {chamado.dataAgendada && (
          <p className="flex items-center gap-1.5 font-semibold text-tema-tinta"><CalendarClock className="w-3.5 h-3.5 text-orange-600" aria-hidden />Agendado: {agendadoTexto(chamado.dataAgendada)}</p>
        )}
        <p className="text-tema-suave">
          {tempo.abertoHa && <>Aberto há {tempo.abertoHa}</>}
          {tempo.emAtendimentoHa && <> · em atendimento há {tempo.emAtendimentoHa}</>}
          {tempo.comecaEm && <> · começa às {tempo.comecaEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
        </p>
        {tempo.atraso && (
          <p className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 font-semibold text-red-700">{tempo.atraso.texto}</p>
        )}
      </div>

      <div className="mt-3 space-y-1">
        {endereco && (
          <p className="text-sm text-tema-texto flex items-start gap-1.5 break-words">
            <MapPin className="w-4 h-4 text-tema-apagado flex-shrink-0 mt-0.5" aria-hidden />{endereco}
          </p>
        )}
        {chamado.telefone && (
          <p className="text-sm text-tema-suave flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-tema-apagado flex-shrink-0" aria-hidden />{chamado.telefone}
          </p>
        )}
      </div>

      <ResumoIxc chamadoId={chamado.id} ehEace={!!chamado.eace} />

      {(chamado.subCategoria || chamado.materiaisReservados?.length > 0) && (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {chamado.subCategoria && <span className="text-xs px-2 py-0.5 bg-orange-500/10 rounded-full text-orange-700 font-medium">{chamado.subCategoria}</span>}
          {chamado.materiaisReservados?.length > 0 && <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-700 rounded-full">{chamado.materiaisReservados.length} material(is)</span>}
        </div>
      )}
      {obs && <p className="text-xs text-tema-apagado italic mt-2 line-clamp-2">{obs}</p>}
      {diag && (
        <p className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-lg text-xs bg-cyan-600/5 border border-cyan-600/15 text-tema-texto">
          <Brain className="w-3.5 h-3.5 text-cyan-700 flex-shrink-0" aria-hidden />
          <span className="font-medium">Diagnóstico NOC: {CLASSIFICACAO_LABEL[diag.classificacao as keyof typeof CLASSIFICACAO_LABEL] ?? diag.classificacao}</span>
          {diag.confianca != null && <span className="text-tema-apagado">({diag.confianca}%)</span>}
        </p>
      )}

      {/* Acao principal (so a da etapa atual) + atalhos secundarios */}
      <div className="mt-4 space-y-2" onClick={e => e.stopPropagation()}>
        {acao && Icone && (
          <button
            type="button"
            onClick={clicarAcao}
            disabled={bloqueado}
            className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-4 rounded-xl text-base font-bold text-white bg-[#D4520A] hover:bg-[#B84508] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2"
          >
            {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Icone className="w-5 h-5" aria-hidden />}
            {enviando ? 'Enviando...' : acao.rotulo}
          </button>
        )}
        <div className="flex gap-2">
          {endereco && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noopener noreferrer" className={secundario}>
              <Navigation className="w-4 h-4 flex-shrink-0" aria-hidden /> Ver rota
            </a>
          )}
          {digitos.length >= 10 && (
            <a href={`https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`} target="_blank" rel="noopener noreferrer" className={secundario}>
              <MessageCircle className="w-4 h-4 flex-shrink-0" aria-hidden /> Contatar cliente
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
