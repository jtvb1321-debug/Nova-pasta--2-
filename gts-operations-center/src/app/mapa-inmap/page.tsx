// src/app/mapa-inmap/page.tsx
import type { Metadata, Viewport } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { MapaInmapView } from '@/components/mapa/MapaInmapView'
import { TecnicoShell } from '@/components/tecnico/TecnicoShell'

export const metadata: Metadata = { title: 'Mapa Inmap / Rede' }
// viewport-fit=cover: deixa a barra inferior do tecnico respeitar a area segura do celular.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function MapaInmapPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as any)?.role

  // Tecnico ve o mapa em tela cheia dentro da moldura do aplicativo (cabecalho + barra inferior),
  // para poder voltar aos chamados, historico e carro sem sair pelo navegador.
  if (role === 'TECNICO') {
    return (
      <TecnicoShell session={session} ativo="mapa" telaCheia>
        <MapaInmapView telaCheia />
      </TecnicoShell>
    )
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
