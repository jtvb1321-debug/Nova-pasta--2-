console.log('[GTS DEPLOY R3] next.config.js carregado')

const nextConfig = {
  distDir: 'dist',
  reactStrictMode: false,
  images: {
    domains: ['localhost'],
  },
  serverExternalPackages: ['socket.io', 'whatsapp-web.js', 'puppeteer', 'puppeteer-core'],
  // Mantido do projeto recebido; nao substitui a verificacao de tipos.
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig