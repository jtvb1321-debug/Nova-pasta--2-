'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Poppins } from 'next/font/google'
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

// Fonte da marca Orbia, so nesta pagina.
const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700'], display: 'swap' })

const loginSchema = z.object({
  email: z.string().email('E-mail invalido'),
  password: z.string().min(1, 'Senha obrigatoria'),
})

type LoginForm = z.infer<typeof loginSchema>

// "Lembrar meu e-mail": so o e-mail fica neste navegador para vir preenchido.
// Nao mexe na sessao nem no login.
const CHAVE_EMAIL_LEMBRADO = 'gts-login-email'

// Simbolo Orbia: arquivo oficial (public/images/orbia-simbolo.svg), cores originais.
function SimboloOrbia({ className }: { className?: string }) {
  return <img src="/images/orbia-simbolo.svg" alt="" aria-hidden className={cn('object-contain', className)} />
}

// Assinatura discreta: o Orbia e um sistema da GTSNet.
function AssinaturaGts({ className }: { className?: string }) {
  return (
    <p className={cn('items-center gap-2 text-xs text-white/50', className)}>
      <img src="/images/gts-globo.svg" alt="" className="w-5 h-5 object-contain" />
      <span>
        <span className="sr-only">Um sistema </span>GTSNet
      </span>
    </p>
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
    'w-full h-[50px] rounded-[9px] border bg-[#18191d]/90 px-3.5 text-base lg:text-[15px] text-white',
    'placeholder:text-white/40 outline-none transition-colors',
    'focus:border-[#ff7a00] focus:ring-2 focus:ring-[#ff7a00]/25',
    comErro ? 'border-red-500/70' : 'border-[#2f3139]',
  )

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#070606] text-white">
      {/* Fundo: cidade e telecom a noite + camada escura (mais forte a esquerda, para o texto) */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/images/login-bg.webp)' }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80 lg:bg-gradient-to-r lg:from-black/75 lg:via-black/55 lg:to-black/60" />

      {/* Marca Orbia (notebook e desktop): posicoes da referencia */}
      <SimboloOrbia className="hidden lg:block absolute z-10 left-[7.5%] top-[6.5%] w-[clamp(76px,6.8vw,132px)] h-auto" />
      <div className={cn('hidden lg:block absolute z-10 left-[6%] top-[23%] max-w-[52%]', poppins.className)}>
        <h1 className="font-bold leading-[0.95] tracking-[-0.02em] text-[clamp(64px,7vw,120px)]">
          Orbi<span className="text-[#ff6a00]">a</span>
        </h1>
        <p className="mt-[clamp(10px,1.6vh,20px)] font-semibold leading-[1.08] tracking-[-0.01em] text-[clamp(28px,2.9vw,54px)]">
          Gestão, monitoramento e<br />controle em um só lugar.
        </p>
      </div>
      <AssinaturaGts className="hidden lg:flex absolute z-10 left-[6%] bottom-[4%]" />

      {/* Login */}
      <main
        className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8 lg:items-end lg:pr-[5.5%] [@media(max-height:760px)]:py-4"
        style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        {/* Celular e tablet: marca Orbia resumida */}
        <div className={cn('lg:hidden flex flex-col items-center text-center', poppins.className)}>
          <div className="flex items-center gap-3">
            <SimboloOrbia className="w-14 h-14" />
            <p className="text-[44px] font-bold leading-none tracking-[-0.02em]">
              Orbi<span className="text-[#ff6a00]">a</span>
            </p>
          </div>
          <p className="mt-3 text-base sm:text-lg font-semibold leading-snug text-white/90 max-w-[26ch]">
            Gestão, monitoramento e controle em um só lugar.
          </p>
        </div>

        <div
          className="w-full max-w-[460px] lg:w-[clamp(400px,29vw,480px)] lg:max-w-none rounded-[22px] border border-[rgba(255,106,0,0.55)] bg-[rgba(10,10,11,0.74)] backdrop-blur-[14px]
            px-6 py-8 sm:px-11 sm:py-9 [@media(max-height:760px)]:py-6"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.45), 0 0 28px rgba(255,90,0,0.12)' }}
        >
          <div className="flex flex-col items-center text-center">
            <SimboloOrbia className="w-[84px] h-[84px] sm:w-[96px] sm:h-[96px] [@media(max-height:760px)]:w-[72px] [@media(max-height:760px)]:h-[72px]" />
            <h2 className={cn('mt-4 text-[28px] sm:text-[30px] font-semibold text-white', poppins.className)}>Bem-vindo!</h2>
            <p className="mt-2 text-[15px] text-white/80 leading-relaxed max-w-[32ch] text-balance">
              Entre com suas credenciais para acessar a plataforma Orbia.
            </p>
          </div>

          <form onSubmit={handleSubmit(enviar)} method="post" className="mt-6 space-y-4 [@media(max-height:760px)]:mt-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-white/90 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-white/70" />
                <input
                  {...register('email')}
                  id="login-email"
                  type="email"
                  inputMode="email"
                  placeholder="seu@email.com"
                  autoComplete="username"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'login-email-erro' : undefined}
                  className={cn(classeInput(!!errors.email), 'pl-11')}
                />
              </div>
              {errors.email && <p id="login-email-erro" className="text-sm text-red-400 mt-1.5">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="login-senha" className="block text-sm font-medium text-white/90 mb-1.5">Senha</label>
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
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
              {errors.password && <p id="login-senha-erro" className="text-sm text-red-400 mt-1.5">{errors.password.message}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <label htmlFor="login-lembrar" className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm text-white/85 select-none">
                <input
                  id="login-lembrar"
                  type="checkbox"
                  checked={lembrarEmail}
                  onChange={e => setLembrarEmail(e.target.checked)}
                  className="w-5 h-5 rounded accent-[#ff6a00] cursor-pointer"
                />
                Lembrar meu e-mail
              </label>
              <button
                type="button"
                onClick={() => setMostrarAjudaSenha(v => !v)}
                aria-expanded={mostrarAjudaSenha}
                aria-controls="login-ajuda-senha"
                className="min-h-[44px] text-sm font-medium text-[#ff7a1a] hover:text-[#ffa24d] focus-visible:outline-none focus-visible:underline"
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
              <div role="alert" className="flex items-start gap-2 rounded-[9px] border border-red-500/40 bg-red-500/10 px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[52px] rounded-[11px] bg-gradient-to-r from-[#ffa040] to-[#ff6a00] px-4 text-base font-semibold text-white
                flex items-center justify-center gap-2 transition-[filter,transform] duration-150
                [@media(hover:hover)]:hover:brightness-110 active:scale-[0.98]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]
                disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                : <>Entrar no Sistema <ArrowRight className="w-4 h-4" aria-hidden /></>
              }
            </button>
          </form>
        </div>

        {/* Celular e tablet: assinatura GTSNet abaixo do card */}
        <AssinaturaGts className="lg:hidden flex self-start sm:self-center" />
      </main>
    </div>
  )
}
