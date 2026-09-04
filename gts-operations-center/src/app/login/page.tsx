'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, AlertCircle, Wifi, Map, Users, Package, BarChart3, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('E-mail invalido'),
  password: z.string().min(1, 'Senha obrigatoria'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    setLoading(true)
    setError('')
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })
      if (result?.error) {
        setError('E-mail ou senha incorretos')
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Erro ao conectar. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#0B1120]">

      {/* Lado esquerdo */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#0B1120] to-[#111827] border-r border-white/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-orange-500/3 rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-12 animate-fade-in-up">
          <div className="w-56 h-56 mb-6 drop-shadow-2xl">
            <img
              src="/images/logo.png"
              alt="GTSNet"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <h1 className="text-5xl font-black mb-3 tracking-tight">
            <span className="text-white">GTS</span>
            <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">net</span>
            <span className="text-white"> Operations Center</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10">
            Centro de Operacoes Inteligente
          </p>

          <div className="space-y-3 text-left w-full max-w-sm">
            {[
              { icon: Map, text: 'Monitoramento de veiculos em tempo real', destaque: true },
              { icon: Users, text: 'Gestao completa das equipes de campo' },
              { icon: Package, text: 'Controle de estoque e materiais' },
              { icon: BarChart3, text: 'Dashboard executivo com KPIs ao vivo' },
              { icon: Bell, text: 'Alertas inteligentes e notificacoes' },
            ].map((f, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 p-3 bg-white/[0.03] border rounded-xl',
                  'transition-all duration-200 hover:bg-white/[0.06] hover:border-orange-500/20 hover:-translate-y-0.5',
                  'animate-fade-in-up',
                  f.destaque ? 'border-orange-500/25 gts-hud-corner' : 'border-white/5'
                )}
                style={{ animationDelay: `${120 + i * 70}ms` }}
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-500/5 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-orange-400" />
                </div>
                <p className="text-sm text-gray-300">{f.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-6 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-mono tracking-wider">SISTEMA ONLINE</span>
          </div>
          <p className="text-gray-600 text-xs">GTSNet — Provedor de Internet</p>
        </div>
      </div>

      {/* Lado direito */}
      <div className="flex-1 lg:max-w-md flex flex-col items-center justify-center px-8 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-orange-500/3 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-sm relative animate-fade-in-up">
          {/* Logo mobile */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-24 h-24 mb-4">
              <img
                src="/images/logo.png"
                alt="GTSNet"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <h1 className="text-xl font-bold">
              <span className="text-white">GTS</span>
              <span className="text-orange-400">net</span>
              <span className="text-white"> Operations</span>
            </h1>
          </div>

          {/* Card */}
          <div className="relative bg-[#111827] border border-white/10 rounded-xl p-8 shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500" />
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#0B1120] p-1.5 flex-shrink-0 ring-1 ring-orange-500/20">
                <img
                  src="/images/icon.png"
                  alt="GTSNet"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Bem-vindo!</h2>
                <p className="text-gray-500 text-xs">Entre com suas credenciais</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">E-mail</label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className={`w-full bg-[#0B1120] border rounded-lg px-3 py-2.5 text-sm text-white
                    placeholder:text-gray-600 focus:outline-none focus:ring-1 transition-colors
                    ${errors.email
                      ? 'border-red-500/50 focus:ring-red-500'
                      : 'border-white/10 focus:ring-orange-500 focus:border-orange-500'
                    }`}
                />
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Senha</label>
                <div className="relative">
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`w-full bg-[#0B1120] border rounded-lg px-3 py-2.5 pr-10 text-sm text-white
                      placeholder:text-gray-600 focus:outline-none focus:ring-1 transition-colors
                      ${errors.password
                        ? 'border-red-500/50 focus:ring-red-500'
                        : 'border-white/10 focus:ring-orange-500 focus:border-orange-500'
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3 rounded-lg
                  transition-all duration-200 flex items-center justify-center gap-2
                  shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] mt-2"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                  : 'Entrar no Sistema'
                }
              </button>
            </form>
          </div>

          <div className="flex items-center justify-center gap-2 mt-6">
            <Wifi className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs text-orange-400">Sistema Online</span>
            <span className="text-gray-600 text-xs mx-2">·</span>
            <span className="text-gray-600 text-xs">GTSNet © {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}