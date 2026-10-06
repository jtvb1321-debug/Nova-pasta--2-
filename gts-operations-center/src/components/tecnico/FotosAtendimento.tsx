'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle, ImageIcon, Loader2, RotateCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MIN_FOTOS, MSG_MIN_FOTOS } from '@/lib/tecnicoChamado'

// ---------------------------------------------------------------------------
// Estado e upload das evidencias do atendimento.
// - Cada foto sobe sozinha (uma requisicao por arquivo) com progresso real.
// - So conta como evidencia valida a foto cujo upload terminou com sucesso.
// - Fotos ja salvas no chamado contam para o minimo e nunca sao removidas aqui.
// ---------------------------------------------------------------------------

export interface ItemFoto {
  id: string
  origem: 'salva' | 'nova'
  nome: string
  status: 'enviando' | 'ok' | 'erro'
  progresso: number
  url?: string          // URL no servidor (so quando ok)
  preview?: string      // URL local (blob) para a miniatura enquanto envia
  erro?: string
}

const MAX_SIMULTANEOS = 3

function enviarArquivo(
  file: File,
  aoProgredir: (pct: number) => void,
  registrarAbort: (abortar: () => void) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    registrarAbort(() => xhr.abort())
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = e => { if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => reject(new Error('Sem conexão. Verifique o sinal e tente novamente.'))
    xhr.onabort = () => reject(new Error('Envio cancelado'))
    xhr.ontimeout = () => reject(new Error('O envio demorou demais. Tente novamente.'))
    xhr.timeout = 120000
    xhr.onload = () => {
      let corpo: any = null
      try { corpo = JSON.parse(xhr.responseText) } catch { /* resposta sem JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && corpo?.urls?.[0]) resolve(corpo.urls[0])
      else reject(new Error(corpo?.error || 'Não foi possível enviar a foto.'))
    }
    const form = new FormData()
    form.append('fotos', file)
    xhr.send(form)
  })
}

export function useFotosAtendimento(salvas: string[], rascunho: string[] = []) {
  const [itens, setItens] = useState<ItemFoto[]>(() => [
    ...salvas.map((url, i) => ({ id: `salva-${i}`, origem: 'salva' as const, nome: `Foto ${i + 1}`, status: 'ok' as const, progresso: 100, url })),
    ...rascunho.filter(u => !salvas.includes(u)).map((url, i) => ({ id: `rasc-${i}`, origem: 'nova' as const, nome: `Foto ${salvas.length + i + 1}`, status: 'ok' as const, progresso: 100, url })),
  ])
  const arquivos = useRef(new Map<string, File>())
  const abortos = useRef(new Map<string, () => void>())
  const emFila = useRef<string[]>([])
  const ativos = useRef(0)
  const contador = useRef(0)
  const montado = useRef(true)

  const atualizar = useCallback((id: string, parcial: Partial<ItemFoto>) => {
    if (!montado.current) return
    setItens(prev => prev.map(i => (i.id === id ? { ...i, ...parcial } : i)))
  }, [])

  const processarFila = useCallback(() => {
    while (ativos.current < MAX_SIMULTANEOS && emFila.current.length > 0) {
      const id = emFila.current.shift()!
      const file = arquivos.current.get(id)
      if (!file) continue
      ativos.current++
      atualizar(id, { status: 'enviando', progresso: 0, erro: undefined })
      enviarArquivo(file, pct => atualizar(id, { progresso: pct }), ab => abortos.current.set(id, ab))
        .then(url => { atualizar(id, { status: 'ok', progresso: 100, url }); arquivos.current.delete(id) })
        .catch((e: Error) => atualizar(id, { status: 'erro', erro: e.message }))
        .finally(() => { ativos.current--; abortos.current.delete(id); processarFila() })
    }
  }, [atualizar])

  const adicionar = useCallback((files: File[]) => {
    const novos: ItemFoto[] = files.map(f => {
      const id = `nova-${Date.now()}-${contador.current++}`
      arquivos.current.set(id, f)
      emFila.current.push(id)
      return { id, origem: 'nova', nome: f.name || 'Foto', status: 'enviando', progresso: 0, preview: URL.createObjectURL(f) }
    })
    setItens(prev => [...prev, ...novos])
    processarFila()
  }, [processarFila])

  const tentarNovamente = useCallback((id: string) => {
    if (!arquivos.current.has(id)) return
    emFila.current.push(id)
    atualizar(id, { status: 'enviando', progresso: 0, erro: undefined })
    processarFila()
  }, [atualizar, processarFila])

  const remover = useCallback((id: string) => {
    abortos.current.get(id)?.()
    emFila.current = emFila.current.filter(x => x !== id)
    arquivos.current.delete(id)
    setItens(prev => {
      const alvo = prev.find(i => i.id === id)
      if (!alvo || alvo.origem === 'salva') return prev   // evidencia antiga nao se apaga
      if (alvo.preview) URL.revokeObjectURL(alvo.preview)
      return prev.filter(i => i.id !== id)
    })
  }, [])

  useEffect(() => {
    montado.current = true
    const ab = abortos.current
    return () => {
      montado.current = false
      ab.forEach(f => f())
    }
  }, [])

  const urlsValidas = itens.filter(i => i.status === 'ok' && i.url).map(i => i.url as string)
  const novasValidas = itens.filter(i => i.origem === 'nova' && i.status === 'ok' && i.url).map(i => i.url as string)

  return {
    itens,
    adicionar,
    tentarNovamente,
    remover,
    urlsValidas,
    novasValidas,
    qtdValidas: urlsValidas.length,
    enviando: itens.some(i => i.status === 'enviando'),
    comFalha: itens.filter(i => i.status === 'erro').length,
    atendeMinimo: urlsValidas.length >= MIN_FOTOS,
  }
}

export type EstadoFotos = ReturnType<typeof useFotosAtendimento>

// ---------------------------------------------------------------------------

export function FotosAtendimento({ fotos, tentouFinalizar }: { fotos: EstadoFotos; tentouFinalizar: boolean }) {
  const inputCamera = useRef<HTMLInputElement>(null)
  const inputGaleria = useRef<HTMLInputElement>(null)
  const [temCamera, setTemCamera] = useState(false)

  useEffect(() => {
    setTemCamera(typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window))
  }, [])

  function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) fotos.adicionar(files)
    e.target.value = ''   // permite escolher o mesmo arquivo de novo
  }

  const faltaMinimo = !fotos.atendeMinimo
  const botao = 'flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 px-3 rounded-xl border-2 border-dashed border-tema-linha-forte text-sm font-semibold text-tema-suave hover:text-orange-700 hover:border-orange-500/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

  return (
    <section aria-labelledby="titulo-fotos">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 id="titulo-fotos" className="text-sm font-semibold text-tema-tinta flex items-center gap-1.5">
          <Camera className="w-4 h-4" aria-hidden />
          Fotos do atendimento — mínimo de {MIN_FOTOS} foto
        </h3>
        <span className={cn(
          'text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0',
          fotos.atendeMinimo ? 'bg-emerald-500/10 text-emerald-700' : 'bg-tema-contraste/[0.06] text-tema-suave'
        )}>
          {fotos.qtdValidas} {fotos.qtdValidas === 1 ? 'foto enviada' : 'fotos enviadas'}
        </span>
      </div>

      <div aria-live="polite">
        {faltaMinimo && (
          <p className={cn(
            'flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3 border',
            tentouFinalizar ? 'bg-red-500/10 border-red-500/25 text-red-700' : 'bg-amber-500/[0.08] border-amber-500/25 text-amber-800'
          )}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            {MSG_MIN_FOTOS}
          </p>
        )}
        {fotos.comFalha > 0 && (
          <p className="text-xs text-red-700 mb-2">
            {fotos.comFalha} {fotos.comFalha === 1 ? 'foto não foi enviada' : 'fotos não foram enviadas'} e {fotos.comFalha === 1 ? 'não conta' : 'não contam'} como evidência. Toque em &quot;Tentar de novo&quot;.
          </p>
        )}
      </div>

      {fotos.itens.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {fotos.itens.map((f, i) => {
            const src = f.preview || f.url
            return (
              <li key={f.id} className="relative aspect-square rounded-xl overflow-hidden bg-tema-contraste/[0.05] border border-tema-linha">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`Foto ${i + 1} do atendimento`}
                    className={cn('w-full h-full object-cover', f.status !== 'ok' && 'opacity-50')}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-tema-apagado" aria-hidden /></div>
                )}

                {f.status === 'enviando' && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-white font-medium">
                      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" aria-hidden />
                      Enviando {f.progresso}%
                    </div>
                    <div className="h-1 rounded-full bg-white/30 mt-1 overflow-hidden">
                      <div className="h-full bg-orange-400 transition-all" style={{ width: `${f.progresso}%` }} />
                    </div>
                  </div>
                )}

                {f.status === 'erro' && (
                  <div className="absolute inset-0 bg-red-950/70 flex flex-col items-center justify-center gap-1.5 p-1.5 text-center">
                    <p className="text-[11px] text-white leading-tight line-clamp-3">{f.erro || 'Falha no envio'}</p>
                    <button
                      type="button"
                      onClick={() => fotos.tentarNovamente(f.id)}
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg bg-white text-red-700 text-[11px] font-bold"
                    >
                      <RotateCw className="w-3 h-3" aria-hidden /> Tentar de novo
                    </button>
                  </div>
                )}

                {f.status === 'ok' && (
                  <span className="absolute left-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5">
                    <CheckCircle className="w-3 h-3" aria-hidden /> {f.origem === 'salva' ? 'Salva' : 'Enviada'}
                  </span>
                )}

                {f.origem === 'nova' && (
                  <button
                    type="button"
                    onClick={() => fotos.remover(f.id)}
                    aria-label={`Remover foto ${i + 1}`}
                    className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <input ref={inputCamera} type="file" accept="image/*" capture="environment" onChange={aoEscolher} className="hidden" />
      <input ref={inputGaleria} type="file" accept="image/*" multiple onChange={aoEscolher} className="hidden" />
      <div className="flex gap-2">
        {temCamera && (
          <button type="button" onClick={() => inputCamera.current?.click()} className={botao}>
            <Camera className="w-4 h-4" aria-hidden /> Tirar foto
          </button>
        )}
        <button type="button" onClick={() => inputGaleria.current?.click()} className={botao}>
          <ImageIcon className="w-4 h-4" aria-hidden /> {temCamera ? 'Escolher da galeria' : 'Selecionar imagens'}
        </button>
      </div>
      <p className="text-[11px] text-tema-apagado mt-2">Fotos adicionais são opcionais.</p>
    </section>
  )
}
