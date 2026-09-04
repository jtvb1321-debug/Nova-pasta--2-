// src/app/ponto/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BaterPontoView } from '@/components/tecnico/BaterPontoView'

export const metadata: Metadata = { title: 'Bater Ponto' }

export default async function PontoPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return <BaterPontoView />
}