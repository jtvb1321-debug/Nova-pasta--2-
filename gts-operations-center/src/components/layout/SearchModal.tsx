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
  chamado: { label: 'Chamado',  icon: ClipboardList, cor: 'text-blue-400 bg-blue-500/10' },
  estoque: { label: 'Estoque',  icon: Package,       cor: 'text-yellow-400 bg-yellow-500/10' },
  equipe:  { label: 'Equipe',   icon: Users,         cor: 'text-emerald-400 bg-emerald-500/10' },
  veiculo: { label: 'Veiculo',  icon: Truck,         cor: 'text-purple-400 bg-purple-500/10' },
  venda:   { label: 'Venda',    icon: ShoppingCart,  cor: 'text-pink-400 bg-pink-500/10' },
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
    ABERTO: 'text-blue-400',
    EM_ANDAMENTO: 'text-yellow-400',
    FINALIZADO: 'text-emerald-400',
    CANCELADO: 'text-gray-400',
    CRITICO: 'text-red-400',
    OK: 'text-emerald-400',
    ATIVO: 'text-emerald-400',
    INATIVO: 'text-gray-400',
    PENDENTE: 'text-yellow-400',
    APROVADO: 'text-emerald-400',
    REPROVADO: 'text-red-400',
    AGUARDANDO: 'text-blue-400',
    ATIVIDADE: 'text-yellow-400',
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 pt-20 px-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
          {loading
            ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin flex-shrink-0" />
            : <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pesquisar cliente, OS, equipe, placa, material..."
            className="flex-1 bg-transparent text-white placeholder:text-gray-500 focus:outline-none text-base"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-white border border-white/10 px-2 py-0.5 rounded transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-6 text-center">
              <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Digite pelo menos 2 caracteres para pesquisar</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Alex', 'Estoque', 'HNP9017', 'Instalacao', 'Fibra'].map(s => (
                  <button
                    key={s}
                    onClick={() => setQuery(s)}
                    className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : resultados.length === 0 && !loading ? (
            <div className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Nenhum resultado para "{query}"</p>
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
                      isSelected ? 'bg-orange-500/10' : 'hover:bg-white/[0.03]'
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', cfg.cor.split(' ')[1])}>
                      <Icon className={cn('w-4 h-4', cfg.cor.split(' ')[0])} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">{r.titulo}</p>
                        <span className={cn('text-xs flex-shrink-0', STATUS_COR[r.status] || 'text-gray-400')}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{r.subtitulo}</p>
                      <p className="text-xs text-gray-600 truncate">{r.detalhe}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', cfg.cor)}>
                        {cfg.label}
                      </span>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 text-orange-400" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center gap-4 text-xs text-gray-600">
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