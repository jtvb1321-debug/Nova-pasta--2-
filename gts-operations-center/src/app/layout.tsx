// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/layout/Providers'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Fonte tecnica para dados numericos/IPs/SLAs em tabelas de alta densidade
// (Chamados, Auditoria, Rede) - Inter continua sendo a fonte padrao de UI.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-tech',
  display: 'swap',
})

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
    <html lang="pt-BR" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
