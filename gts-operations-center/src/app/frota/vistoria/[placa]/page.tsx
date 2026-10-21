import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { temPermissao } from '@/lib/permissions'
import { VistoriaShell } from '@/components/frota/VistoriaShell'
import { VistoriaWizard } from '@/components/frota/VistoriaWizard'

export const metadata: Metadata = { title: 'Vistoria da viatura' }

// Link do motorista: /frota/vistoria/{PLACA}. Exige login (o middleware leva ao /login e o login volta para este link).
export default async function VistoriaPage({ params }: { params: Promise<{ placa: string }> }) {
  const { placa: bruta } = await params
  if (!/^[A-Za-z0-9]{7}$/.test(bruta)) notFound()
  const placa = bruta.toUpperCase()
  const session = await auth()
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/frota/vistoria/${placa}`)}`)
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'vistoriarFrota')) redirect('/403')
  return (
    <VistoriaShell voltarPara="/frota" rotuloVoltar="Frota">
      <VistoriaWizard placa={placa} podeVoltarParaFrota />
    </VistoriaShell>
  )
}
