import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { TROCA_OBRIGATORIA_DESDE, ACAO_SENHA_ALTERADA } from '@/lib/senha'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email as string },
        })

        if (!usuario || !usuario.ativo) return null

        const senhaValida = await bcrypt.compare(credentials.password as string, usuario.senha)
        if (!senhaValida) return null

        const trocou = await prisma.log.findFirst({
          where: {
            usuarioId: usuario.id,
            acao: ACAO_SENHA_ALTERADA,
            createdAt: { gte: TROCA_OBRIGATORIA_DESDE },
          },
          select: { id: true },
        })

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          role: usuario.role,
          trocarSenha: !trocou,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.trocarSenha = (user as any).trocarSenha
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
        ;(session.user as any).trocarSenha = token.trocarSenha
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