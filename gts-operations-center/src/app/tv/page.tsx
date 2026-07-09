import type { Metadata } from 'next'
import { TVDashboard } from '@/components/noc/TVDashboard'

export const metadata: Metadata = { title: 'GTS NOC — TV Dashboard' }

export default function TVPage() {
  return <TVDashboard />
}