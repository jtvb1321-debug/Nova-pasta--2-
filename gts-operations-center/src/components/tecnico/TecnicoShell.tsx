'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { ClipboardList, Truck, Map, LogOut, History, ChevronDown } from 'lucide-react'
import type { Session } from 'next-auth'
import { cn, getInitials } from '@/lib/utils'

// Moldura da area do tecnico: menu lateral no computador; no celular, cabecalho azul-marinho
// compacto + barra de navegacao fixa embaixo. Compartilhada por todas as telas do tecnico
// (/meus-chamados, /historico-os, /meu-carro, /mapa-inmap) para a navegacao ser sempre a mesma.
// Os estilos ficam isolados na classe .app-tecnico (globals.css) e nao afetam o resto do sistema.

export type PaginaTecnico = 'chamados' | 'historico' | 'carro' | 'mapa'

const NAV: { id: PaginaTecnico; href: string; label: string; curto: string; icon: React.ElementType }[] = [
  { id: 'chamados', href: '/meus-chamados', label: 'Meus chamados', curto: 'Chamados', icon: ClipboardList },
  { id: 'historico', href: '/historico-os', label: 'Histórico de O.S.', curto: 'Histórico', icon: History },
  { id: 'carro',    href: '/meu-carro',     label: 'Meu carro / estoque', curto: 'Meu carro', icon: Truck },
  { id: 'mapa',     href: '/mapa-inmap',    label: 'InMap / rotas', curto: 'Rotas', icon: Map },
]

const foco = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60'

// Campo de digitacao em foco = teclado virtual aberto: a barra inferior sai da frente para nao cobrir o campo.
function campoDeTexto(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type)
  return el.isContentEditable
}

function MenuPerfil({ nome, className }: { nome: string; className?: string }) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent | TouchEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('touchstart', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('touchstart', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Perfil de ${nome || 'técnico'}`}
        className={cn('flex items-center gap-1 min-h-[44px] pl-1 pr-2 rounded-xl text-white hover:bg-white/10 transition-colors', foco)}
      >
        <span className="w-9 h-9 rounded-full bg-orange-500 text-white font-bold text-sm flex items-center justify-center" aria-hidden>
          {getInitials(nome || 'T')}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-white/80 transition-transform', aberto && 'rotate-180')} aria-hidden />
      </button>
      {aberto && (
        <div role="menu" aria-label="Perfil" className="absolute right-0 top-full mt-1.5 w-56 rounded-2xl border border-tema-linha bg-tema-superficie p-1.5 z-50" style={{ boxShadow: '0 8px 24px rgba(15, 30, 54, 0.18)' }}>
          <p className="px-3 py-2 text-sm font-semibold text-tema-tinta truncate border-b border-tema-linha mb-1">{nome}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={cn('w-full flex items-center gap-2.5 px-3 min-h-[44px] rounded-xl text-sm font-semibold text-red-700 hover:bg-red-500/5 transition-colors', foco)}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

export function TecnicoShell({ session, ativo, telaCheia = false, children }: { session: Session; ativo: PaginaTecnico; /** Conteudo ocupa toda a area (mapa), sem margens. */ telaCheia?: boolean; children: React.ReactNode }) {
  const [agora, setAgora] = useState('')
  const [teclado, setTeclado] = useState(false)

  useEffect(() => {
    const atualizar = () => setAgora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    atualizar()
    const i = setInterval(atualizar, 15000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const entrou = (e: FocusEvent) => { clearTimeout(t); if (campoDeTexto(e.target)) setTeclado(true) }
    const saiu = () => { clearTimeout(t); t = setTimeout(() => setTeclado(false), 150) }
    document.addEventListener('focusin', entrou)
    document.addEventListener('focusout', saiu)
    return () => { clearTimeout(t); document.removeEventListener('focusin', entrou); document.removeEventListener('focusout', saiu) }
  }, [])

  const nome = session.user?.name ?? ''
  const primeiroNome = nome.split(' ')[0] ?? ''

  return (
    <div className="app-tecnico min-h-[100dvh] bg-tema-fundo lg:flex lg:items-start">
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
            {getInitials(nome || 'T')}
          </div>
          <div className="min-w-0">
            <p className="text-tema-tinta font-semibold text-sm truncate">{primeiroNome}</p>
            <p className="text-tema-apagado text-xs tabular-nums">{agora}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Área do técnico">
          {NAV.map(n => (
            <Link
              key={n.id}
              href={n.href}
              aria-current={n.id === ativo ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold transition-colors',
                foco,
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
        {/* Cabecalho - celular e tablet */}
        <header
          className="lg:hidden sticky top-0 z-40 bg-[#0B1F3A] text-white"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 h-14">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                <img src="/images/orbia-simbolo.svg" alt="Orbia" className="w-7 h-7 object-contain" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-base font-extrabold" style={{ letterSpacing: '-0.02em' }}>Orbi<span className="text-orange-400">a</span></p>
                <p className="text-xs text-white/80 truncate">{nome || 'Técnico'}</p>
              </div>
            </div>
            <MenuPerfil nome={nome} />
          </div>
        </header>

        <main className={cn('w-full', telaCheia ? 'tec-mapa' : 'tec-conteudo p-4 lg:p-6 max-w-5xl')}>
          {children}
        </main>
      </div>

      {/* Barra de navegacao - celular e tablet */}
      <nav
        aria-label="Área do técnico"
        hidden={teclado}
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-tema-superficie border-t border-tema-linha-forte"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxShadow: '0 -2px 8px rgba(15, 30, 54, 0.06)' }}
      >
        <ul className="grid grid-cols-4">
          {NAV.map(n => {
            const ehAtivo = n.id === ativo
            return (
              <li key={n.id}>
                <Link
                  href={n.href}
                  title={n.label}
                  aria-current={ehAtivo ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 min-h-[60px] px-1 text-xs font-semibold transition-colors',
                    foco, 'focus-visible:ring-inset',
                    ehAtivo ? 'text-orange-700' : 'text-tema-suave'
                  )}
                >
                  {ehAtivo && <span className="absolute top-0 inset-x-6 h-[3px] rounded-b-full bg-orange-600" aria-hidden />}
                  <span className={cn('w-12 h-7 rounded-full flex items-center justify-center', ehAtivo && 'bg-orange-500/10')}>
                    <n.icon className="w-5 h-5" aria-hidden />
                  </span>
                  <span className="leading-none">{n.curto}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
