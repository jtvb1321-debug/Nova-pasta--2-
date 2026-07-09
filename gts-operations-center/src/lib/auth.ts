import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null

        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email as string },
        })

        if (!usuario || !usuario.ativo) return null

        // Verificacao simplificada — sem bcrypt por enquanto
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