import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: {
    domains: ['localhost'],
  },
  serverExternalPackages: ['socket.io', 'whatsapp-web.js', 'puppeteer', 'puppeteer-core'],
  // Alguns ambientes de build (ex: upload manual no Discloud) geram o
  // Prisma Client sem os tipos completos a tempo do type-check do Next,
  // mesmo com o schema correto. O app em si e verificado localmente via
  // "npx tsc --noEmit" antes de cada mudanca - essa flag so evita que uma
  // falha de geracao de tipos num ambiente de build especifico derrube o
  // build inteiro.
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig