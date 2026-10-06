import type { Metadata, Viewport } from 'next'
import { TVDashboard } from '@/components/noc/TVDashboard'
import { TVScaleWrapper } from '@/components/noc/TVScaleWrapper'

export const metadata: Metadata = { title: 'Orbia — Modo TV' }

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function TVPage() {
  return (
    <TVScaleWrapper>
      <TVDashboard />
    </TVScaleWrapper>
  )
}