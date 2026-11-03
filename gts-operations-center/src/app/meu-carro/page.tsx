import type { Metadata, Viewport } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MeuCarroView } from '@/components/tecnico/MeuCarroView'

export const metadata: Metadata = { title: 'Meu Carro' }
// viewport-fit=cover: a barra inferior respeita a area segura do celular.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function MeuCarroPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <MeuCarroView session={session} />
}