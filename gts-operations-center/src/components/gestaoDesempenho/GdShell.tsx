'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dataHoraFortaleza } from '@/lib/gestaoDesempenho/formato'
import { enviarJson, useGd } from './comum'

const ABAS = [
  { href: '/gestao-desempenho', rotulo: 'Visão geral' },
  { href: '/gestao-desempenho/recepcao', rotulo: 'Recepção' },
  { href: '/gestao-desempenho/equipes', rotulo: 'Equipes de campo' },
  { href: '/gestao-desempenho/relatorios', rotulo: 'Relatórios' },
  { href: '/gestao-desempenho/configuracoes', rotulo: 'Configurações' },
]

interface Notif { id: string; titulo: string; mensagem: string; severidade: 'INFO' | 'ATENCAO' | 'CRITICA'; lida: boolean; createdAt: string }

function Sino() {
  const [aberto, setAberto] = useState(false)
  const qc = useQueryClient()
  const { data } = useGd<{ naoLidas: number; notificacoes: Notif[] }>(['notificacoes'], '/api/gestao-desempenho/notificacoes', { atualizarMs: 60_000 })
  const marcar = async (ids: string[] | 'todas') => { await enviarJson('/api/gestao-desempenho/notificacoes', 'PATCH', { ids }); qc.invalidateQueries({ queryKey: ['gd', 'notificacoes'] }) }
  const cor = { INFO: 'bg-tema-contraste/[0.3]', ATENCAO: 'bg-amber-500', CRITICA: 'bg-red-500' }
  return (
    <div className="relative">
      <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto} aria-label={`Notificações${data?.naoLidas ? `: ${data.naoLidas} não lidas` : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-tema-linha bg-tema-superficie hover:bg-tema-contraste/[0.04]">
        <Bell className="h-4 w-4" aria-hidden />
        {!!data?.naoLidas && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">{data.naoLidas}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,22rem)] rounded-xl border border-tema-linha bg-tema-superficie p-2 shadow-lg" role="dialog" aria-label="Notificações da Gestão de Desempenho">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-xs font-semibold text-tema-tinta">Notificações</p>
            {!!data?.naoLidas && <button type="button" onClick={() => marcar('todas')} className="inline-flex items-center gap-1 text-[11px] text-orange-700 hover:underline"><Check className="h-3 w-3" aria-hidden />Marcar todas como lidas</button>}
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {(data?.notificacoes ?? []).length === 0 && <li className="px-2 py-6 text-center text-xs text-tema-apagado">Nenhuma notificação.</li>}
            {(data?.notificacoes ?? []).map(n => (
              <li key={n.id}>
                <button type="button" onClick={() => !n.lida && marcar([n.id])} className={cn('flex w-full gap-2 rounded-lg px-2 py-2 text-left hover:bg-tema-contraste/[0.04]', !n.lida && 'bg-orange-500/[0.05]')}>
                  <span className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full', cor[n.severidade])} aria-hidden />
                  <span className="min-w-0"><span className={cn('block text-xs text-tema-tinta', !n.lida && 'font-semibold')}>{n.titulo}</span><span className="block text-[11px] text-tema-suave">{n.mensagem}</span><span className="block text-[10px] text-tema-apagado">{dataHoraFortaleza(n.createdAt)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function GdShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Gestão de Desempenho</h1>
          <p className="text-xs text-tema-apagado">Indicadores da recepção (OPA Atendimento) e das equipes de campo (GTSCenter). Horário de Fortaleza.</p>
        </div>
        <Sino />
      </div>
      <nav aria-label="Seções da Gestão de Desempenho" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex min-w-max gap-1 border-b border-tema-linha">
          {ABAS.map(a => {
            const ativa = a.href === '/gestao-desempenho' ? path === a.href : path.startsWith(a.href)
            return (
              <li key={a.href}>
                <Link href={a.href} aria-current={ativa ? 'page' : undefined} className={cn('block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', ativa ? 'border-orange-600 text-orange-700' : 'border-transparent text-tema-suave hover:text-tema-tinta')}>{a.rotulo}</Link>
              </li>
            )
          })}
        </ul>
      </nav>
      {children}
    </div>
  )
}
