'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, AlertCircle, Wifi, MapPin, ClipboardList, Package, BarChart3, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('E-mail invalido'),
  password: z.string().min(1, 'Senha obrigatoria'),
})

type LoginForm = z.infer<typeof loginSchema>

// "Lembrar meu e-mail": so o e-mail fica neste navegador para vir preenchido.
// Nao mexe na sessao nem no login.
const CHAVE_EMAIL_LEMBRADO = 'gts-login-email'

const RECURSOS = [
  { icon: MapPin, titulo: 'Monitoramento em tempo real', texto: 'Acompanhe veículos e equipes em campo com total visibilidade.' },
  { icon: ClipboardList, titulo: 'Gestão de chamados', texto: 'Atendimento mais ágil e organizado.' },
  { icon: Package, titulo: 'Controle de estoque', texto: 'Rastreabilidade de materiais e equipamentos.' },
  { icon: BarChart3, titulo: 'Dashboards e indicadores', texto: 'Dados para decisões mais assertivas.' },
]

function MarcaGts({ tamanho = 'md' }: { tamanho?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img
        src="/images/icon.png"
        alt=""
        className={cn('flex-shrink-0 object-contain', tamanho === 'sm' ? 'w-9 h-9' : 'w-11 h-11 xl:w-12 xl:h-12')}
      />
      <div className="min-w-0 leading-tight">
        <p className={cn('font-black tracking-tight', tamanho === 'sm' ? 'text-lg' : 'text-xl xl:text-2xl')}>
          <span className="text-white">GTS</span><span className="text-[#ff7a00]">net</span>
        </p>
        <p className={cn('font-medium uppercase tracking-[0.18em] text-white/60', tamanho === 'sm' ? 'text-[10px]' : 'text-[11px]')}>
          Operations Center
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lembrarEmail, setLembrarEmail] = useState(false)
  const [mostrarAjudaSenha, setMostrarAjudaSenha] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_EMAIL_LEMBRADO)
      if (salvo) { setValue('email', salvo); setLembrarEmail(true) }
    } catch {}
  }, [setValue])

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

  // Guarda (ou esquece) o e-mail conforme a opcao e segue para o login de sempre.
  function enviar(data: LoginForm) {
    try {
      if (lembrarEmail) localStorage.setItem(CHAVE_EMAIL_LEMBRADO, data.email)
      else localStorage.removeItem(CHAVE_EMAIL_LEMBRADO)
    } catch {}
    return onSubmit(data)
  }

  const classeInput = (comErro: boolean) => cn(
    'w-full min-h-[48px] rounded-[10px] border bg-[#202226] px-3.5 text-base lg:text-[15px] text-white',
    'placeholder:text-white/35 outline-none transition-colors',
    'focus:border-[#ff7a00] focus:ring-2 focus:ring-[#ff7a00]/25',
    comErro ? 'border-red-500/70' : 'border-[#34373d]',
  )

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#0b0c0e] text-white">
      {/* Fundo: rede de fibra ao entardecer + camada escura para leitura */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/images/login-bg.svg)' }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/70 lg:bg-gradient-to-r lg:from-black/50 lg:via-black/15 lg:to-black/60" />

      <div
        className="relative z-10 min-h-[100dvh] grid grid-cols-1 lg:grid-cols-[58fr_42fr] xl:grid-cols-[65fr_35fr]"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Area institucional (notebook e desktop) */}
        <section className="hidden lg:flex flex-col justify-between gap-8 px-[clamp(32px,5vw,96px)] py-[clamp(28px,6vh,72px)] min-w-0">
          <MarcaGts />

          <div className="max-w-[640px] min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ff7a00]">Centro de Operações Inteligente</p>
            <h1 className="mt-3 font-black tracking-tight leading-[1.05] text-[clamp(34px,3.6vw,58px)] text-balance">
              GTS<span className="text-[#ff7a00]">net</span> Operations Center
            </h1>
            <ul className="mt-[clamp(20px,4vh,40px)] grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-[clamp(14px,2.4vh,24px)] [@media(max-height:760px)]:hidden">
              {RECURSOS.map(r => (
                <li key={r.titulo} className="flex gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-lg border border-[#ff7a00]/35 bg-[#ff7a00]/10 flex items-center justify-center flex-shrink-0">
                    <r.icon className="w-[18px] h-[18px] text-[#ff8a2a]" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-white">{r.titulo}</span>
                    <span className="block text-sm text-white/65 leading-snug">{r.texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-white/55">Conectando pessoas, impulsionando negócios.</p>
        </section>

        {/* Login */}
        <main className="flex flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8 lg:px-[clamp(24px,3vw,56px)] [@media(max-height:700px)]:py-5 min-w-0">
          {/* Celular e tablet: marca reduzida */}
          <div className="lg:hidden flex flex-col items-center text-center gap-2">
            <MarcaGts tamanho="sm" />
            <p className="hidden md:block text-sm text-white/65">Centro de Operações Inteligente</p>
          </div>

          <div
            className="w-full max-w-[440px] rounded-[18px] border border-[rgba(255,102,0,0.35)] bg-[rgba(15,15,15,0.90)] backdrop-blur-[16px] p-6 sm:p-8 [@media(max-height:700px)]:p-5"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}
          >
            <img src="/images/icon.png" alt="GTSNet" className="w-10 h-10 object-contain" />
            <h2 className="mt-4 text-2xl font-bold text-white">Bem-vindo!</h2>
            <p className="mt-1 text-sm text-white/65 leading-relaxed">
              Entre com suas credenciais para acessar o GTSNet Operations Center.
            </p>

            <form onSubmit={handleSubmit(enviar)} method="post" className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-white/80 mb-1.5">E-mail</label>
                <input
                  {...register('email')}
                  id="login-email"
                  type="email"
                  inputMode="email"
                  placeholder="seu@email.com"
                  autoComplete="username"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'login-email-erro' : undefined}
                  className={classeInput(!!errors.email)}
                />
                {errors.email && <p id="login-email-erro" className="text-sm text-red-400 mt-1.5">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="login-senha" className="block text-sm font-medium text-white/80 mb-1.5">Senha</label>
                <div className="relative">
                  <input
                    {...register('password')}
                    id="login-senha"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'login-senha-erro' : undefined}
                    className={cn(classeInput(!!errors.password), 'pr-12')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg text-white/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
                {errors.password && <p id="login-senha-erro" className="text-sm text-red-400 mt-1.5">{errors.password.message}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <label htmlFor="login-lembrar" className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm text-white/75 select-none">
                  <input
                    id="login-lembrar"
                    type="checkbox"
                    checked={lembrarEmail}
                    onChange={e => setLembrarEmail(e.target.checked)}
                    className="w-[18px] h-[18px] rounded border-[#34373d] bg-[#202226] accent-[#ff7a00] cursor-pointer"
                  />
                  Lembrar meu e-mail
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarAjudaSenha(v => !v)}
                  aria-expanded={mostrarAjudaSenha}
                  aria-controls="login-ajuda-senha"
                  className="min-h-[44px] text-sm font-medium text-[#ff8a2a] hover:text-[#ffa24d] focus-visible:outline-none focus-visible:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              {mostrarAjudaSenha && (
                <p id="login-ajuda-senha" className="text-sm text-white/75 border-l-2 border-[#ff7a00] pl-3 -mt-1">
                  Peça ao administrador do sistema para redefinir sua senha (menu Usuários).
                </p>
              )}

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-red-500/40 bg-red-500/10 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-[10px] bg-gradient-to-r from-[#ff7a00] to-[#ff5a00] px-4 text-base font-semibold text-white
                  flex items-center justify-center gap-2 transition-[filter,transform] duration-150
                  [@media(hover:hover)]:hover:brightness-110 active:scale-[0.99]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f]
                  disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                  : <>Entrar no Sistema <ArrowRight className="w-4 h-4" aria-hidden /></>
                }
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/55">
            <Wifi className="w-3.5 h-3.5 text-[#ff7a00]" aria-hidden />
            <span className="text-white/75">Sistema Online</span>
            <span aria-hidden>·</span>
            <span>GTSNet © {new Date().getFullYear()}</span>
          </div>
        </main>
      </div>
    </div>
  )
}
