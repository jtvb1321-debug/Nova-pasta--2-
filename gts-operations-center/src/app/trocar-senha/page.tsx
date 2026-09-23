'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'
import { SENHA_MIN } from '@/lib/senha'

const schema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: z.string().min(SENHA_MIN, `Use pelo menos ${SENHA_MIN} caracteres`).max(72, 'Use no maximo 72 caracteres'),
  confirmar: z.string(),
}).refine(d => d.novaSenha === d.confirmar, { message: 'As senhas nao conferem', path: ['confirmar'] })

type Form = z.infer<typeof schema>

const campo = (erro?: boolean) => `w-full bg-[#FCFBF8] border rounded-lg px-3 py-2.5 pr-10 text-sm text-[#201D17]
  placeholder:text-[#A69E8F] focus:outline-none focus:ring-1 transition-colors
  ${erro ? 'border-red-500/50 focus:ring-red-500' : 'border-[#D8D2C3] focus:ring-orange-600 focus:border-orange-600'}`

export default function TrocarSenhaPage() {
  const { data: session } = useSession()
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Form) {
    setEnviando(true)
    setErro('')
    try {
      const res = await fetch('/api/conta/senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual: data.senhaAtual, novaSenha: data.novaSenha }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(json.error || 'Nao foi possivel trocar a senha. Tente novamente.')
        setEnviando(false)
        return
      }
      // A sessao atual ainda carrega a marca de senha padrao: sair e entrar de novo.
      setConcluido(true)
      setTimeout(() => signOut({ callbackUrl: '/login' }), 2000)
    } catch {
      setErro('Erro ao conectar. Tente novamente.')
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="relative bg-white border border-[#E6E1D6] rounded-xl p-8 shadow-xl shadow-black/[0.04] overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600" />
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-[#FDEDDD] flex items-center justify-center flex-shrink-0 ring-1 ring-orange-500/20">
              <KeyRound className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#201D17]">Troque sua senha</h1>
              <p className="text-[#A69E8F] text-xs">
                Voce entrou com a senha padrao{session?.user?.email ? ` (${session.user.email})` : ''}. Defina uma senha propria para continuar.
              </p>
            </div>
          </div>

          {concluido ? (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-700 flex-shrink-0" />
              <p className="text-sm text-green-800">Senha alterada. Entre novamente com a nova senha.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="senhaAtual" className="block text-sm font-medium text-[#7A7266] mb-1.5">Senha atual</label>
                <input id="senhaAtual" {...register('senhaAtual')} type={mostrar ? 'text' : 'password'}
                  autoComplete="current-password" className={campo(!!errors.senhaAtual)} />
                {errors.senhaAtual && <p className="text-xs text-red-600 mt-1">{errors.senhaAtual.message}</p>}
              </div>

              <div>
                <label htmlFor="novaSenha" className="block text-sm font-medium text-[#7A7266] mb-1.5">Nova senha</label>
                <div className="relative">
                  <input id="novaSenha" {...register('novaSenha')} type={mostrar ? 'text' : 'password'}
                    autoComplete="new-password" className={campo(!!errors.novaSenha)} />
                  <button type="button" onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? 'Ocultar senhas' : 'Mostrar senhas'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A69E8F] hover:text-[#201D17] transition-colors">
                    {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.novaSenha && <p className="text-xs text-red-600 mt-1">{errors.novaSenha.message}</p>}
              </div>

              <div>
                <label htmlFor="confirmar" className="block text-sm font-medium text-[#7A7266] mb-1.5">Confirme a nova senha</label>
                <input id="confirmar" {...register('confirmar')} type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password" className={campo(!!errors.confirmar)} />
                {errors.confirmar && <p className="text-xs text-red-600 mt-1">{errors.confirmar.message}</p>}
              </div>

              {erro && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700">{erro}</p>
                </div>
              )}

              <button type="submit" disabled={enviando}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-lg
                  transition-all duration-200 flex items-center justify-center gap-2
                  disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] mt-2">
                {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar nova senha'}
              </button>

              <button type="button" onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-sm text-[#7A7266] hover:text-[#201D17] py-1 transition-colors">
                Sair
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
