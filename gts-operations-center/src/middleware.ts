import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const PUBLIC_ROUTES = [
  '/login',
  '/api/auth',
  '/403',
]

const ROTAS_TECNICO = [
  '/meus-chamados',
  '/meu-carro',
  '/ponto',
  '/escala',
  '/mapa-inmap',
  '/api/tickets',
  '/api/teams',
  '/api/agenda',
  '/api/upload',
  '/api/inventory',
  '/api/movements',
  '/api/vehicles',
  '/api/tecnico',
  '/api/ponto',
  '/api/escala',
  '/api/gts',
  '/diagnostico',
  '/api/diagnostico',
]

const ROTAS_VENDEDOR = [
  '/dashboard',
  '/sales',
  '/api/sales',
  '/api/dashboard',
]

const ROTAS_BLOQUEADAS_OPERADOR = [
  '/users',
  '/audit',
  '/settings',
  '/api/users',
  '/api/audit',
]

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Ignorar arquivos estaticos e uploads
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Rotas publicas
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    if (pathname === '/login' && session) {
      const role = (session.user as any)?.role
      if (role === 'TECNICO')  return NextResponse.redirect(new URL('/meus-chamados', req.url))
      if (role === 'VENDEDOR') return NextResponse.redirect(new URL('/sales', req.url))
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Rota raiz
  if (pathname === '/') {
    if (session) {
      const role = (session.user as any)?.role
      if (role === 'TECNICO')  return NextResponse.redirect(new URL('/meus-chamados', req.url))
      if (role === 'VENDEDOR') return NextResponse.redirect(new URL('/sales', req.url))
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Sem sessao
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = (session.user as any)?.role || 'OPERADOR'

  // TECNICO - acesso restrito
  if (role === 'TECNICO') {
    const podeAcessar = ROTAS_TECNICO.some(r => pathname.startsWith(r))
    if (!podeAcessar) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/meus-chamados', req.url))
    }
  }

  // VENDEDOR - acesso restrito
  if (role === 'VENDEDOR') {
    const podeAcessar = ROTAS_VENDEDOR.some(r => pathname.startsWith(r))
    if (!podeAcessar) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/sales', req.url))
    }
  }

  // OPERADOR e COMERCIAL - bloquear rotas de sistema
  if (role === 'OPERADOR' || role === 'COMERCIAL') {
    const bloqueado = ROTAS_BLOQUEADAS_OPERADOR.some(r => pathname.startsWith(r))
    if (bloqueado) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/403', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}