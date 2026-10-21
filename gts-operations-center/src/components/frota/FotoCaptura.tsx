'use client'

import { useRef } from 'react'
import { Camera, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { urlFoto } from './comum'

// Um quadro de foto: abre a camera direto no celular (capture="environment") e mostra a miniatura.
export interface EstadoFoto { id?: string; preview?: string; enviando?: boolean; erro?: string }

export function FotoCaptura({ rotulo, estado, obrigatoria = true, compacta = false, onEscolher, onInvalida }: {
  rotulo: string
  estado: EstadoFoto | undefined
  obrigatoria?: boolean
  compacta?: boolean
  onEscolher: (arquivo: File) => void
  /** A foto guardada no rascunho nao existe mais no servidor. */
  onInvalida?: () => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const tem = !!estado?.id
  const idInput = `foto-${rotulo.replace(/[^A-Za-z0-9]+/g, '-')}-${compacta ? 'c' : 'q'}`
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-tema-superficie', estado?.erro ? 'border-red-500/50' : tem ? 'border-emerald-500/40' : 'border-dashed border-tema-linha-forte')}>
      <input ref={entrada} id={idInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1}
        onChange={e => { const f = e.target.files?.[0]; if (f) onEscolher(f); e.target.value = '' }} />
      <button type="button" onClick={() => entrada.current?.click()} disabled={estado?.enviando}
        aria-label={tem ? `Refazer a foto: ${rotulo}` : `Tirar a foto: ${rotulo}`}
        className={cn('relative flex w-full items-center justify-center bg-tema-contraste/[0.04]', compacta ? 'h-24' : 'aspect-[4/3]')}>
        {tem && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={estado?.preview ?? urlFoto(estado!.id!)} alt={rotulo} onError={() => onInvalida?.()} className="h-full w-full object-cover" />
        )}
        {!tem && !estado?.enviando && <span className="flex flex-col items-center gap-1 text-tema-suave"><Camera className="h-7 w-7" aria-hidden /><span className="text-xs font-semibold">Tirar foto</span></span>}
        {estado?.enviando && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"><Loader2 className="h-6 w-6 animate-spin" aria-hidden /><span className="sr-only">Enviando a foto</span></span>}
        {tem && !estado?.enviando && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-white"><RefreshCw className="h-3.5 w-3.5" aria-hidden /></span>}
      </button>
      <div className="px-2.5 py-1.5">
        <p className="text-xs font-semibold text-tema-tinta">{rotulo}{obrigatoria && !tem && <span className="text-red-600"> *</span>}</p>
        {estado?.erro && <p role="alert" className="mt-0.5 flex items-start gap-1 text-[11px] text-red-700"><AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" aria-hidden />{estado.erro}</p>}
      </div>
    </div>
  )
}
