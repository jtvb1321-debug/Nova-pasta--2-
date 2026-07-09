import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: {
    domains: ['localhost'],
  },
  serverExternalPackages: ['socket.io'],
}

export default nextConfig