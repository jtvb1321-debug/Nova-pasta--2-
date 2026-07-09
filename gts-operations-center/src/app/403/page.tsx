import Link from 'next/link'
import { ShieldX, ArrowLeft, Home } from 'lucide-react'

export default function AcessoNegadoPage() {
  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Icone */}
        <div className="w-24 h-24 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-12 h-12 text-red-400" />
        </div>

        {/* Codigo */}
        <p className="text-8xl font-black text-red-500/20 mb-2">403</p>

        {/* Titulo */}
        <h1 className="text-2xl font-bold text-white mb-3">Acesso Negado</h1>

        {/* Descricao */}
        <p className="text-gray-400 mb-2">
          Voce nao tem permissao para acessar esta pagina.
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Se acredita que isso e um erro, entre em contato com o Administrador do sistema.
        </p>

        {/* Botoes */}
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Home className="w-4 h-4" />
            Ir para Dashboard
          </Link>
          <Link
            href="javascript:history.back()"
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
        </div>

        {/* Logo */}
        <div className="mt-12 flex items-center justify-center gap-2 opacity-40">
          <img src="/images/icon.png" alt="GTSNet" className="w-6 h-6 object-contain" />
          <span className="text-gray-500 text-xs">GTSNet Operations Center</span>
        </div>
      </div>
    </div>
  )
}