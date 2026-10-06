'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { signOut } from 'next-auth/react'
import { ClipboardList, Truck, Map, Clock, LogOut } from 'lucide-react'
import type { Session } from 'next-auth'
import { cn, getInitials } from '@/lib/utils'
import { situacaoLabel } from '@/lib/jornada'

// Moldura da area do tecnico (menu lateral no computador, barra no celular).
// Compartilhada por /meus-chamados e /meu-carro para a navegacao ser a mesma.

export type PaginaTecnico = 'chamados' | 'carro' | 'mapa' | 'ponto'

const NAV: { id: PaginaTecnico; href: string; label: string; icon: React.ElementType }[] = [
  { id: 'chamados', href: '/meus-chamados', label: 'Meus chamados', icon: ClipboardList },
  { id: 'carro',    href: '/meu-carro',     label: 'Meu carro / estoque', icon: Truck },
  { id: 'mapa',     href: '/mapa-inmap',    label: 'InMap / rotas', icon: Map },
  { id: 'ponto',    href: '/ponto',         label: 'Ponto', icon: Clock },
]

const SITUACAO_HOJE_CFG: Record<string, { cor: string; bg: string; dot: string }> = {
  Trabalhado:         { cor: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-600' },
  'Ponto Incompleto': { cor: 'text-blue-700',    bg: 'bg-blue-500/10 border-blue-500/25',       dot: 'bg-blue-600' },
  Falta:              { cor: 'text-red-700',     bg: 'bg-red-500/10 border-red-500/25',         dot: 'bg-red-600' },
  Atestado:           { cor: 'text-purple-700',  bg: 'bg-purple-500/10 border-purple-500/25',   dot: 'bg-purple-600' },
  Folga:              { cor: 'text-sky-700',     bg: 'bg-sky-500/10 border-sky-500/25',         dot: 'bg-sky-600' },
  Feriado:            { cor: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-500' },
}

async function fetchMeuPonto() {
  const res = await fetch('/api/ponto/meu')
  if (!res.ok) throw new Error()
  return res.json()
}

export function TecnicoShell({ session, ativo, children }: { session: Session; ativo: PaginaTecnico; children: React.ReactNode }) {
  const [agora, setAgora] = useState('')

  useEffect(() => {
    const atualizar = () => setAgora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    atualizar()
    const i = setInterval(atualizar, 15000)
    return () => clearInterval(i)
  }, [])

  const { data: meuPonto } = useQuery({
    queryKey: ['meu-ponto-painel'],
    queryFn: fetchMeuPonto,
    refetchInterval: 60000,
  })
  const situacaoHoje = meuPonto?.hoje ? situacaoLabel(meuPonto.hoje.tipoRegistro, meuPonto.hoje.horasTrabalhadas) : null
  const situacaoCfg = situacaoHoje ? (SITUACAO_HOJE_CFG[situacaoHoje] || SITUACAO_HOJE_CFG['Ponto Incompleto']) : null
  const primeiroNome = session.user?.name?.split(' ')[0] ?? ''

  const BadgeSituacao = ({ className }: { className?: string }) => situacaoCfg ? (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border', situacaoCfg.cor, situacaoCfg.bg, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', situacaoCfg.dot)} aria-hidden />
      {situacaoHoje}
    </span>
  ) : null

  return (
    <div className="min-h-screen bg-tema-fundo lg:flex lg:items-start">
      {/* Menu lateral - computador */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[240px] lg:flex-shrink-0 lg:sticky lg:top-0 lg:h-screen bg-tema-superficie border-r border-tema-linha p-4 gap-4">
        <div className="flex items-center gap-2 px-1">
          <img src="/images/orbia-simbolo.svg" alt="" aria-hidden className="w-9 h-9 object-contain" />
          <p className="text-xl font-extrabold text-tema-tinta" style={{ letterSpacing: '-0.02em' }}>
            Orbi<span className="text-orange-500">a</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="w-10 h-10 rounded-full bg-orange-500/15 text-orange-700 font-bold text-sm flex items-center justify-center flex-shrink-0" aria-hidden>
            {getInitials(session.user?.name || 'T')}
          </div>
          <div className="min-w-0">
            <p className="text-tema-tinta font-semibold text-sm truncate">{primeiroNome}</p>
            <p className="text-tema-apagado text-xs tabular-nums">{agora}</p>
          </div>
        </div>
        <BadgeSituacao className="w-fit" />

        <nav className="flex flex-col gap-1" aria-label="Área do técnico">
          {NAV.map(n => (
            <Link
              key={n.id}
              href={n.href}
              aria-current={n.id === ativo ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                n.id === ativo ? 'bg-orange-500/10 text-orange-700' : 'text-tema-suave hover:bg-tema-contraste/[0.04] hover:text-tema-tinta'
              )}
            >
              <n.icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-auto flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-500/5 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden />
          Sair
        </button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra - celular e tablet */}
        <header className="lg:hidden sticky top-0 z-20 bg-tema-superficie border-b border-tema-linha">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/images/orbia-simbolo.svg" alt="" aria-hidden className="w-8 h-8 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-tema-tinta font-bold text-sm truncate">{primeiroNome}</p>
                <p className="text-tema-apagado text-xs tabular-nums">{agora}</p>
              </div>
            </div>
            <BadgeSituacao className="flex-shrink-0" />
          </div>
          <nav aria-label="Área do técnico" className="flex items-center gap-1.5 px-3 pb-2.5 overflow-x-auto">
            {NAV.map(n => (
              <Link
                key={n.id}
                href={n.href}
                aria-current={n.id === ativo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-colors',
                  n.id === ativo ? 'bg-orange-500/10 text-orange-700 border-orange-500/30' : 'bg-tema-superficie text-tema-suave border-tema-linha'
                )}
              >
                <n.icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                {n.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 border border-tema-linha bg-tema-superficie text-red-700"
            >
              <LogOut className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
              Sair
            </button>
          </nav>
        </header>

        <main className="p-4 lg:p-6 w-full max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  )
}
