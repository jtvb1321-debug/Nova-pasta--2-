'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { TopBarCompacta } from './TopBarCompacta'
import { AlertasPanel } from './AlertasPanel'
import { useQuery } from '@tanstack/react-query'

interface AppShellProps {
  children: React.ReactNode
  title?: string
  // 'orbia': visual reformulado (menu 250px, barra unica compacta). So as
  // paginas ja migradas (Dashboard, Chamados) usam; as demais seguem o shell de sempre.
  variante?: 'orbia'
  // Nome da pagina mostrado na barra compacta (variante 'orbia').
  paginaAtual?: string
}

async function fetchAlertas() {
  const res = await fetch('/api/alerts')
  if (!res.ok) return []
  return res.json()
}

export function AppShell({ children, title, variante, paginaAtual }: AppShellProps) {
  const dashboard = variante === 'orbia'
  const [alertasAberto, setAlertasAberto] = useState(false)

  const { data: alertas = [] } = useQuery({
    queryKey: ['alertas'],
    queryFn: fetchAlertas,
    refetchInterval: 30000,
  })

  return (
    <div className={dashboard ? 'dash-orbia flex h-screen overflow-hidden bg-tema-fundo' : 'flex h-screen overflow-hidden bg-tema-fundo'}>
      <Sidebar variante={variante} />
      <div className="relative flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="relative z-10">
          {dashboard ? (
            <TopBarCompacta
              pagina={paginaAtual}
              onAlertasClick={() => setAlertasAberto(!alertasAberto)}
              totalAlertas={alertas.length}
            />
          ) : (
            <TopBar
              title={title}
              onAlertasClick={() => setAlertasAberto(!alertasAberto)}
              totalAlertas={alertas.length}
            />
          )}
        </div>
        <main className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>

      {/* Painel de alertas */}
      {alertasAberto && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setAlertasAberto(false)}
          />
          <AlertasPanel onClose={() => setAlertasAberto(false)} />
        </>
      )}
    </div>
  )
}