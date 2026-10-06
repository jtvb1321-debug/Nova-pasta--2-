// src/app/mapa-inmap/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { MapaInmapView } from '@/components/mapa/MapaInmapView'

export const metadata: Metadata = { title: 'Mapa Inmap / Rede' }

export default async function MapaInmapPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as any)?.role

  // Tecnico ve o mapa sem o AppShell padrao (tela cheia, estilo mobile) -
  // por isso nao precisa reservar espaco pro cabecalho que nao existe aqui.
  if (role === 'TECNICO') {
    return <MapaInmapView telaCheia />
  }

  return (
    <AppShell variante="orbia" paginaAtual="Mapa Inmap / Rede">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Mapa Inmap / Rede</h1>
        <MapaInmapView />
      </div>
    </AppShell>
  )
}