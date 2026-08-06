'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { AlertasPanel } from './AlertasPanel'
import { useQuery } from '@tanstack/react-query'
import { MissionControlBackground } from '@/components/noc/MissionControlBackground'

interface AppShellProps {
  children: React.ReactNode
  title?: string
}

async function fetchAlertas() {
  const res = await fetch('/api/alerts')
  if (!res.ok) return []
  return res.json()
}

export function AppShell({ children, title }: AppShellProps) {
  const [alertasAberto, setAlertasAberto] = useState(false)

  const { data: alertas = [] } = useQuery({
    queryKey: ['alertas'],
    queryFn: fetchAlertas,
    refetchInterval: 30000,
  })

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1120]">
      <Sidebar />
      <div className="relative flex-1 flex flex-col overflow-hidden min-w-0">
        <MissionControlBackground />
        <div className="relative z-10">
          <TopBar
            title={title}
            onAlertasClick={() => setAlertasAberto(!alertasAberto)}
            totalAlertas={alertas.length}
          />
        </div>
        <main className="relative z-10 flex-1 overflow-y-auto p-6">
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