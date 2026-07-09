// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/layout/Providers'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: {
    default: 'GTS Operations Center',
    template: '%s | GTS Operations Center',
  },
  description: 'Painel de monitoramento operacional GTSNet',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
