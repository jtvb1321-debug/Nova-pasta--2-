'use client'

import { Clock, Users, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { TIPO_COR, STATUS_CONFIG, detectarPrioridade } from './CardChamado'

// Card compacto pra timeline/colunas da agenda - mesma linguagem visual do
// CardChamado (cores de tipo/status), so resumido pra caber em varias
// linhas de uma vez. Clicar abre o CardChamado completo (com todas as
// acoes) num modal - ver CalendarioAgenda.tsx.
export interface AgendaItem {
  id: string
  cliente: string
  tipo: string
  status: string
  equipe: string | null
  equipeId: string | null
  agendadoPor: string | null
  ehAgendamento: boolean
  dataReferencia: string
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  telefone: string | null
  observacao: string | null
  reincidente: boolean
  materiaisCount: number
}

function enderecoResumido(item: AgendaItem) {
  const linha1 = [item.endereco, item.numero].filter(Boolean).join(', ')
  const linha2 = [item.bairro, item.cidade].filter(Boolean).join(' - ')
  const completo = [linha1, linha2].filter(Boolean).join(' — ')
  if (completo.length <= 46) return completo || 'Endereco nao informado'
  return completo.slice(0, 43).trimEnd() + '...'
}

export function AgendaCard({ item, onClick }: { item: AgendaItem; onClick: () => void }) {
  const prioridade = detectarPrioridade(item.observacao || '')
  const sCfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.ABERTO
  const tipoCor = TIPO_COR[item.tipo as TipoChamado] || 'text-gray-400'
  const dotStatus = sCfg.cls.split(' ')[0].replace('text-', 'bg-')
  const hora = item.dataReferencia
    ? new Date(item.dataReferencia).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-2 transition-colors bg-white/[0.02] hover:bg-white/[0.06]',
        prioridade === 'CRITICO' ? 'border-red-500/40' :
        prioridade === 'URGENTE' ? 'border-yellow-500/30' :
        'border-white/5'
      )}
    >
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className="text-[10px] font-mono text-gray-500 flex items-center gap-1 flex-shrink-0">
          <Clock className="w-3 h-3" />
          {hora}
        </span>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 flex-shrink-0', sCfg.cls)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', dotStatus)} />
          {sCfg.label}
        </span>
      </div>
      <p className={cn('text-[10px] font-bold uppercase tracking-wide mb-0.5', tipoCor)}>
        {TIPO_CHAMADO_LABELS[item.tipo as TipoChamado] || item.tipo}
      </p>
      <p className="text-xs font-semibold text-white truncate mb-0.5">{item.cliente}</p>
      {item.equipe && (
        <p className="text-[10px] text-orange-400 truncate flex items-center gap-1 mb-0.5">
          <Users className="w-2.5 h-2.5 flex-shrink-0" />
          {item.equipe}
        </p>
      )}
      <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
        {enderecoResumido(item)}
      </p>
    </button>
  )
}
