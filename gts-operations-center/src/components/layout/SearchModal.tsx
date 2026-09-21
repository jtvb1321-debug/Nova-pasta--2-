'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, ClipboardList, Package,
  Users, Truck, ShoppingCart, Loader2,
  AlertTriangle, CheckCircle, ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TIPO_CONFIG: Record<string, { label: string; icon: React.ElementType; cor: string }> = {
  chamado: { label: 'Chamado',  icon: ClipboardList, cor: 'text-blue-700 bg-blue-500/10' },
  estoque: { label: 'Estoque',  icon: Package,       cor: 'text-amber-700 bg-amber-500/10' },
  equipe:  { label: 'Equipe',   icon: Users,         cor: 'text-emerald-700 bg-emerald-500/10' },
  veiculo: { label: 'Veiculo',  icon: Truck,         cor: 'text-purple-700 bg-purple-500/10' },
  venda:   { label: 'Venda',    icon: ShoppingCart,  cor: 'text-pink-700 bg-pink-500/10' },
}

interface Props {
  onClose: () => void
}

export function SearchModal({ onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selecionado, setSelecionado] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setResultados([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResultados(data)
        setSelecionado(0)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelecionado(s => Math.min(s + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelecionado(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && resultados[selecionado]) {
      irPara(resultados[selecionado])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  function irPara(resultado: any) {
    router.push(resultado.href)
    onClose()
  }

  const STATUS_COR: Record<string, string> = {
    ABERTO: 'text-blue-700',
    EM_ANDAMENTO: 'text-amber-700',
    FINALIZADO: 'text-emerald-700',
    CANCELADO: 'text-[#A69E8F]',
    CRITICO: 'text-red-700',
    OK: 'text-emerald-700',
    ATIVO: 'text-emerald-700',
    INATIVO: 'text-[#A69E8F]',
    PENDENTE: 'text-amber-700',
    APROVADO: 'text-emerald-700',
    REPROVADO: 'text-red-700',
    AGUARDANDO: 'text-blue-700',
    ATIVIDADE: 'text-amber-700',
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 pt-20 px-4">
      <div className="bg-white border border-[#E6E1D6] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[#E6E1D6]">
          {loading
            ? <Loader2 className="w-5 h-5 text-[#A69E8F] animate-spin flex-shrink-0" />
            : <Search className="w-5 h-5 text-[#A69E8F] flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pesquisar cliente, OS, equipe, placa, material..."
            className="flex-1 bg-transparent text-[#201D17] placeholder:text-[#A69E8F] focus:outline-none text-base"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#A69E8F] hover:text-[#201D17] transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-[#A69E8F] hover:text-[#201D17] border border-[#E6E1D6] px-2 py-0.5 rounded transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-6 text-center">
              <Search className="w-8 h-8 text-[#A69E8F] mx-auto mb-2" />
              <p className="text-[#A69E8F] text-sm">Digite pelo menos 2 caracteres para pesquisar</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Alex', 'Estoque', 'HNP9017', 'Instalacao', 'Fibra'].map(s => (
                  <button
                    key={s}
                    onClick={() => setQuery(s)}
                    className="px-3 py-1 bg-black/[0.02] border border-[#E6E1D6] rounded-full text-xs text-[#7A7266] hover:text-[#201D17] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : resultados.length === 0 && !loading ? (
            <div className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-[#A69E8F] mx-auto mb-2" />
              <p className="text-[#A69E8F] text-sm">Nenhum resultado para "{query}"</p>
            </div>
          ) : (
            <div className="py-2">
              {resultados.map((r, i) => {
                const cfg = TIPO_CONFIG[r.tipo] || TIPO_CONFIG.chamado
                const Icon = cfg.icon
                const isSelected = i === selecionado

                return (
                  <button
                    key={r.id}
                    onClick={() => irPara(r)}
                    onMouseEnter={() => setSelecionado(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
                      isSelected ? 'bg-orange-500/10' : 'hover:bg-black/[0.02]'
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', cfg.cor.split(' ')[1])}>
                      <Icon className={cn('w-4 h-4', cfg.cor.split(' ')[0])} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#201D17] truncate">{r.titulo}</p>
                        <span className={cn('text-xs flex-shrink-0', STATUS_COR[r.status] || 'text-[#7A7266]')}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#7A7266] truncate">{r.subtitulo}</p>
                      <p className="text-xs text-[#A69E8F] truncate">{r.detalhe}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', cfg.cor)}>
                        {cfg.label}
                      </span>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 text-orange-600" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#E6E1D6] flex items-center gap-4 text-xs text-[#A69E8F]">
          <span>↑↓ Navegar</span>
          <span>Enter Abrir</span>
          <span>ESC Fechar</span>
          {resultados.length > 0 && (
            <span className="ml-auto">{resultados.length} resultado(s)</span>
          )}
        </div>
      </div>
    </div>
  )
}