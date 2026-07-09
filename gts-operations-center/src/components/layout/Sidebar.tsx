'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import { getPermissions } from '@/lib/permissions'
import {
  LayoutDashboard, Activity, Users, ClipboardList,
  Package, BarChart3, ShoppingCart, Settings,
  LogOut, ChevronLeft, ChevronRight, Bell,
  Monitor, TrendingUp, Map, ChevronDown, Shield,
  UserCog, DollarSign,
} from 'lucide-react'
import { useState, useMemo } from 'react'

interface MenuItem {
  href:      string
  label:     string
  icon:      React.ElementType
  permissao: string
}

interface MenuGroup {
  label:     string
  permissao: string
  items:     MenuItem[]
}

const TODOS_GRUPOS: MenuGroup[] = [
  {
    label:     'Geral',
    permissao: 'verDashboard',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissao: 'verDashboard' },
    ],
  },
  {
    label:     'Operacional',
    permissao: 'verChamados',
    items: [
      { href: '/noc',          label: 'NOC',           icon: Activity,      permissao: 'verNOC' },
      { href: '/agenda',       label: 'Chamados',      icon: ClipboardList, permissao: 'verChamados' },
      { href: '/teams',        label: 'Equipes',       icon: Users,         permissao: 'verEquipes' },
      { href: '/productivity', label: 'Produtividade', icon: TrendingUp,    permissao: 'verProdutividade' },
    ],
  },
  {
    label:     'Monitoramento',
    permissao: 'verMapa',
    items: [
      { href: '/map', label: 'Mapa & Veiculos', icon: Map, permissao: 'verMapa' },
    ],
  },
  {
    label:     'Estoque',
    permissao: 'verEstoque',
    items: [
      { href: '/inventory', label: 'Estoque & Movimentacoes', icon: Package, permissao: 'verEstoque' },
    ],
  },
  {
    label:     'Comercial',
    permissao: 'verVendas',
    items: [
      { href: '/sales',      label: 'Vendas',      icon: ShoppingCart, permissao: 'verVendas' },
      { href: '/financeiro', label: 'Financeiro',  icon: DollarSign,   permissao: 'verFinanceiro' },
      { href: '/reports',    label: 'Relatorios',  icon: BarChart3,    permissao: 'verRelatorios' },
    ],
  },
  {
    label:     'Sistema',
    permissao: 'verAuditoria',
    items: [
      { href: '/users',    label: 'Usuarios',      icon: UserCog, permissao: 'editarUsuarios' },
      { href: '/audit',    label: 'Auditoria',     icon: Shield,  permissao: 'verAuditoria' },
      { href: '/tv',       label: 'Modo TV',       icon: Monitor, permissao: 'verTV' },
      { href: '/settings', label: 'Configuracoes', icon: Settings,permissao: 'verConfiguracoes' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({
    Geral:          true,
    Operacional:    true,
    Monitoramento:  true,
    Estoque:        true,
    Comercial:      true,
    Sistema:        false,
  })

  const role        = (session?.user as any)?.role || 'OPERADOR'
  const permissions = useMemo(() => getPermissions(role), [role])

  const menuGroups = useMemo(() => {
    return TODOS_GRUPOS
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          (permissions as any)[item.permissao] === true
        ),
      }))
      .filter(group => group.items.length > 0)
  }, [permissions])

  function toggleGrupo(label: string) {
    setGruposAbertos(prev => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside className={cn(
      'relative flex flex-col h-screen bg-[#111827] border-r border-white/5 transition-all duration-300 z-50',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-[#0B1120] p-1">
          <img src="/images/icon.png" alt="GTSNet" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-sm leading-tight">
              <span className="text-white">GTS</span>
              <span className="text-orange-400">net</span>
            </p>
            <p className="text-gray-500 text-xs">Operations Center</p>
          </div>
        )}
      </div>

      {/* Botao colapsar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 bg-[#111827] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {menuGroups.map((group) => {
          const grupoAberto = gruposAbertos[group.label] ?? true
          const temAtivo = group.items.some(i =>
            pathname === i.href || pathname.startsWith(i.href + '/')
          )
          return (
            <div key={group.label}>
              {!collapsed && (
                <button
                  onClick={() => toggleGrupo(group.label)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 mb-0.5 rounded-lg transition-colors',
                    temAtivo ? 'text-orange-400' : 'text-gray-600 hover:text-gray-400'
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider">{group.label}</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', grupoAberto ? 'rotate-0' : '-rotate-90')} />
                </button>
              )}
              {collapsed && <div className="w-6 h-px bg-white/10 mx-auto my-2" />}
              {(grupoAberto || collapsed) && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group relative',
                          isActive
                            ? 'bg-orange-500/10 text-orange-400'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-orange-400 rounded-r-full" />
                        )}
                        <Icon className={cn('flex-shrink-0 w-4 h-4', isActive ? 'text-orange-400' : '')} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {collapsed && (
                          <div className="absolute left-full ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl border border-white/10">
                            {item.label}
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Alerta estoque */}
      {!collapsed && permissions.verEstoque && (
        <div className="mx-2 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400 font-medium">Estoque critico</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Verifique os itens abaixo do minimo</p>
        </div>
      )}

      {/* Usuario */}
      <div className="border-t border-white/5 p-3 flex-shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold flex-shrink-0">
              {session?.user?.name ? getInitials(session.user.name) : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{session?.user?.name || 'Usuario'}</p>
              <p className="text-xs text-orange-400/70 truncate font-medium">{role}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-gray-500 hover:text-red-400 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex justify-center text-gray-500 hover:text-red-400 transition-colors py-1"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  )
}