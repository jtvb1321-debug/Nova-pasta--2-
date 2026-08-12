'use client'

import { useState } from 'react'
import {
  Zap, Clock, CheckCircle, XCircle, MapPin, User, Package, Calendar,
  ChevronDown, ChevronUp, MessageCircle, Navigation, Ban, Repeat, Send, StopCircle,
  CalendarClock,
} from 'lucide-react'
import { cn, timeAgo, formatDateTime, formatarEnderecoCompleto } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado, type StatusChamado } from '@/types'
import { TrocarEquipeModal } from './TrocarEquipeModal'
import { ReagendarModal } from './ReagendarModal'

export const PRIORIDADE_COR: Record<string, string> = {
  CRITICO: 'text-red-400 bg-red-500/10 border-red-500/30',
  URGENTE: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  NORMAL:  'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

export const STATUS_CONFIG: Record<StatusChamado, { label: string; icon: React.ElementType; cls: string }> = {
  AGENDADO:     { label: 'Agendado', icon: Calendar,      cls: 'text-purple-400 bg-purple-500/10' },
  ABERTO:       { label: 'Aguardando', icon: Clock,         cls: 'text-blue-400 bg-blue-500/10' },
  EM_ANDAMENTO: { label: 'Em Andamento', icon: Zap,         cls: 'text-yellow-400 bg-yellow-500/10' },
  FINALIZADO:   { label: 'Finalizado', icon: CheckCircle,   cls: 'text-emerald-400 bg-emerald-500/10' },
  CANCELADO:    { label: 'Cancelado', icon: XCircle,        cls: 'text-gray-400 bg-gray-500/10' },
}

export const TIPO_COR: Record<TipoChamado, string> = {
  INSTALACAO: 'text-blue-400',
  MANUTENCAO: 'text-yellow-400',
  RETIRADA:   'text-red-400',
  SUPORTE:    'text-purple-400',
  ROMPIMENTO_MASSIVO: 'text-red-500',
}

export function detectarPrioridade(obs: string) {
  if (obs?.includes('[CRITICO]')) return 'CRITICO'
  if (obs?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

export function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?-?\s?/g, '').replace(/Bairro:[^-]*/g, '').trim() || ''
}

// Importar Wrench separadamente
function Wrench(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

export function CardChamado({
  chamado,
  isAdmin = false,
  mostrarFinalizar = false,
  acaoRapidaEncerrar = false,
  expandido = false,
  onToggle,
  onFinalizar,
  onIniciar,
  onEncerrarAdmin,
  isOperador = false,
  onAlterarTipo,
  onEncaminhar,
}: {
  chamado: any
  isAdmin?: boolean
  mostrarFinalizar?: boolean
  acaoRapidaEncerrar?: boolean
  expandido?: boolean
  onToggle?: () => void
  onFinalizar?: (c: any) => void
  onIniciar?: (id: string) => void
  onEncerrarAdmin?: (id: string) => void
  isOperador?: boolean
  onAlterarTipo?: (id: string, tipo: string) => void
  onEncaminhar?: (id: string) => void
}) {
  const prioridade = detectarPrioridade(chamado.observacao)
  const pCor = PRIORIDADE_COR[prioridade]
  const sCfg = STATUS_CONFIG[chamado.status as StatusChamado] || STATUS_CONFIG.ABERTO
  const StatusIcon = sCfg.icon
  const materiaisCount = chamado.materiaisReservados?.length ?? 0
  const obs = limparObservacao(chamado.observacao)
  const emDeslocamento = chamado.status === 'ABERTO' && chamado.equipe?.status === 'DESLOCAMENTO'
  const emAtividade = chamado.status === 'EM_ANDAMENTO'
  const podeEncerrarAdmin = chamado.status !== 'FINALIZADO' && chamado.status !== 'CANCELADO'
  const [showTrocarEquipe, setShowTrocarEquipe] = useState(false)
  const [showReagendar, setShowReagendar] = useState(false)

  return (
    <div className={cn(
      'bg-[#111827] border rounded-xl transition-all',
      prioridade === 'CRITICO' ? 'border-red-500/30' :
      prioridade === 'URGENTE' ? 'border-yellow-500/20' :
      'border-white/5 hover:border-white/10'
    )}>
      {/* Header clicavel */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className={cn(
          'w-1 rounded-full flex-shrink-0 self-stretch',
          prioridade === 'CRITICO' ? 'bg-red-500' :
          prioridade === 'URGENTE' ? 'bg-yellow-500' : 'bg-blue-500'
        )} style={{ minHeight: 40 }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-bold">{chamado.cliente}</h3>
              {prioridade !== 'NORMAL' && (
                <span className={cn('text-xs px-2 py-0.5 rounded-full border font-bold', pCor)}>
                  {prioridade}
                </span>
              )}
              {chamado.reincidente && (
                <span
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 font-bold"
                  title="Este cliente abriu outro chamado recentemente"
                >
                  <Repeat className="w-3 h-3" />
                  Reincidente
                </span>
              )}
              <span className={cn('status-badge text-xs', sCfg.cls)}>
                <StatusIcon className="w-3 h-3" />
                {sCfg.label}
              </span>
              <span className={cn('text-xs font-medium', TIPO_COR[chamado.tipo as TipoChamado])}>
                {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-600">{timeAgo(chamado.createdAt)}</span>
              {onToggle && (
                expandido
                  ? <ChevronUp className="w-4 h-4 text-gray-500" />
                  : <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {chamado.cidade}
            </span>
            {chamado.equipe && (
              <span className="flex items-center gap-1 text-orange-400">
                <User className="w-3 h-3" />
                {chamado.equipe.nome}
              </span>
            )}
            {isAdmin && chamado.status !== 'FINALIZADO' && chamado.status !== 'CANCELADO' && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowTrocarEquipe(true) }}
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 underline decoration-dotted"
              >
                Trocar equipe
              </button>
            )}
            {(isAdmin || isOperador) && (chamado.status === 'ABERTO' || chamado.status === 'AGENDADO') && onAlterarTipo && (
              <select
                value={chamado.tipo}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); onAlterarTipo(chamado.id, e.target.value) }}
                className="bg-white/5 border border-orange-500/20 text-orange-400 text-xs rounded px-1.5 py-0.5 focus:outline-none"
                title="Alterar tipo do chamado (antes da equipe iniciar)"
              >
                {(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as TipoChamado[]).map(t => (
                  <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>
                ))}
              </select>
            )}
            {(isAdmin || isOperador) && (chamado.status === 'ABERTO' || chamado.status === 'AGENDADO') && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowReagendar(true) }}
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 underline decoration-dotted"
                title="Define um horario para o atendimento - ele sai da fila de despacho imediato e aparece na agenda"
              >
                <CalendarClock className="w-3 h-3" />
                {chamado.dataAgendada ? 'Reagendar' : 'Definir horario'}
              </button>
            )}
            {materiaisCount > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <Package className="w-3 h-3" />
                {materiaisCount} material(is)
              </span>
            )}
          </div>

          {acaoRapidaEncerrar && isAdmin && podeEncerrarAdmin && onEncerrarAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onEncerrarAdmin(chamado.id) }}
              className="flex items-center gap-1.5 mt-3 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-bold text-red-400 transition-colors"
              title="Encerra o chamado direto, sem passar por atendimento. Nao notifica Telegram nem entra em relatorios."
            >
              <Ban className="w-3.5 h-3.5" />
              Encerrar Chamado
            </button>
          )}
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Endereco completo</p>
              <p className="text-sm text-white">{formatarEnderecoCompleto(chamado)}</p>
            </div>
            {chamado.telefone && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Telefone</p>
                <p className="text-sm text-white">{chamado.telefone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">Abertura</p>
              <p className="text-sm text-white">{formatDateTime(chamado.dataAbertura)}</p>
            </div>
            {chamado.dataInicio && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Inicio Atividade</p>
                <p className="text-sm text-white">{formatDateTime(chamado.dataInicio)}</p>
              </div>
            )}
            {chamado.dataFim && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Finalizacao</p>
                <p className="text-sm text-emerald-400">{formatDateTime(chamado.dataFim)}</p>
              </div>
            )}
          </div>

          {obs && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Observacao</p>
              <p className="text-sm text-gray-300 bg-white/[0.02] rounded-lg px-3 py-2 italic">{obs}</p>
            </div>
          )}

          {/* Materiais reservados */}
          {chamado.materiaisReservados?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Package className="w-3 h-3" /> Materiais Reservados
              </p>
              <div className="space-y-1">
                {chamado.materiaisReservados.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-white/[0.02] rounded px-2 py-1">
                    <span className="text-gray-300">{m.item?.descricao}</span>
                    <span className="text-blue-400 font-mono">{m.quantidade} {m.item?.unidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materiais utilizados */}
          {chamado.materiaisUtilizados?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Materiais Utilizados
              </p>
              <div className="space-y-1">
                {chamado.materiaisUtilizados.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-emerald-500/5 rounded px-2 py-1">
                    <span className="text-gray-300">{m.item?.descricao}</span>
                    <span className="text-emerald-400 font-mono">{m.quantidade} {m.item?.unidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botoes rapidos */}
          {mostrarFinalizar && (
            <div className="flex flex-wrap gap-2 pt-1">
              {chamado.telefone && (
                <button
                  onClick={() => window.open(`https://wa.me/55${chamado.telefone.replace(/\D/g, '')}`, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-xs font-medium text-green-400 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              )}
              <button
                onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(formatarEnderecoCompleto(chamado))}`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs font-medium text-blue-400 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5" />
                Abrir no Mapa
              </button>
              {chamado.status === 'AGENDADO' && (isAdmin || isOperador) && onEncaminhar && (
                <button
                  onClick={() => onEncaminhar(chamado.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs font-bold text-purple-400 transition-colors"
                  title="Ativa o chamado agora, sem esperar a data/hora agendada"
                >
                  <Send className="w-3.5 h-3.5" />
                  Encaminhar para Equipe
                </button>
              )}
              {emDeslocamento && onIniciar && (
                <button
                  onClick={() => onIniciar(chamado.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg text-xs font-bold text-black transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Iniciar Atividade
                </button>
              )}
              {emAtividade && onFinalizar && (
                <button
                  onClick={() => onFinalizar(chamado)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-bold text-white transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  Finalizar Chamado
                </button>
              )}
              {isAdmin && podeEncerrarAdmin && onEncerrarAdmin && (
                <button
                  onClick={() => onEncerrarAdmin(chamado.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-bold text-red-400 transition-colors"
                  title="Encerra o chamado direto, sem passar por atendimento. Nao notifica Telegram nem entra em relatorios."
                >
                  <Ban className="w-3.5 h-3.5" />
                  Encerrar (Admin)
                </button>
              )}
            </div>
          )}

          {/* Feedback pos-atendimento - envio e automatico (1h apos o encerramento) */}
          {chamado.status === 'FINALIZADO' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {chamado.feedbackEnviado ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-500">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Feedback enviado {chamado.feedbackEnviadoEm ? `em ${formatDateTime(chamado.feedbackEnviadoEm)}` : ''}
                </span>
              ) : !chamado.telefone ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-500">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Sem telefone cadastrado - feedback nao sera enviado
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-500">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Feedback sera enviado automaticamente 1h apos o encerramento
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {showTrocarEquipe && (
        <TrocarEquipeModal
          chamado={chamado}
          onClose={() => setShowTrocarEquipe(false)}
        />
      )}
      {showReagendar && (
        <ReagendarModal
          chamado={chamado}
          onClose={() => setShowReagendar(false)}
        />
      )}

    </div>
  )
}
