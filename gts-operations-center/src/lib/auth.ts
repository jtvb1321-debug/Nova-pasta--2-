import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/getClientIp'
import { excedeuLimite, registrarFalha, limparTentativas } from '@/lib/rateLimiter'
import { registrarLog } from '@/lib/auditLog'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string
        const ip = getClientIp(request)
        const chaveLimite = `${ip}:${email}`

        if (excedeuLimite(chaveLimite)) {
          await registrarLog({
            acao: 'LOGIN_BLOQUEADO_RATE_LIMIT',
            entidade: 'Usuario',
            detalhes: `Muitas tentativas de login para ${email}`,
            request,
          })
          return null
        }

        const usuario = await prisma.usuario.findUnique({
          where: { email },
        })

        if (!usuario || !usuario.ativo) {
          registrarFalha(chaveLimite)
          await registrarLog({
            acao: 'LOGIN_FALHOU',
            entidade: 'Usuario',
            detalhes: `Tentativa de login com e-mail invalido/inativo: ${email}`,
            request,
          })
          return null
        }

        const senhaValida = await bcrypt.compare(credentials.password as string, usuario.senha)
        if (!senhaValida) {
          registrarFalha(chaveLimite)
          await registrarLog({
            usuarioId: usuario.id,
            acao: 'LOGIN_FALHOU',
            entidade: 'Usuario',
            entidadeId: usuario.id,
            detalhes: `Senha incorreta para ${email}`,
            request,
          })
          return null
        }

        limparTentativas(chaveLimite)
        await registrarLog({
          usuarioId: usuario.id,
          acao: 'LOGIN_SUCESSO',
          entidade: 'Usuario',
          entidadeId: usuario.id,
          detalhes: `Login de ${usuario.nome}`,
          request,
        })

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          role: usuario.role,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
})