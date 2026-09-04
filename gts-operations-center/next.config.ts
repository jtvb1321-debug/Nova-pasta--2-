import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: {
    domains: ['localhost'],
  },
  serverExternalPackages: ['socket.io', 'whatsapp-web.js', 'puppeteer', 'puppeteer-core'],
}

export default nextConfig