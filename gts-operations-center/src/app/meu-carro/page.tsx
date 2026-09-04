import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MeuCarroView } from '@/components/tecnico/MeuCarroView'

export const metadata: Metadata = { title: 'Meu Carro' }

export default async function MeuCarroPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <MeuCarroView session={session} />
}