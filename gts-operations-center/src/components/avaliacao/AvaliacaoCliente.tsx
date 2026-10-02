'use client'

import { useEffect, useState } from 'react'
import { Star, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'

type Resolucao = 'SIM' | 'PARCIAL' | 'NAO'

interface DadosAvaliacao {
  status: 'PENDENTE' | 'RESPONDIDA' | 'EXPIRADA'
  cliente: string
  tipo: string
  dataAtendimento: string | null
  equipe: string | null
}

const OPCOES_RESOLUCAO: { valor: Resolucao; label: string; ativo: string }[] = [
  { valor: 'SIM', label: 'Sim', ativo: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700' },
  { valor: 'PARCIAL', label: 'Em parte', ativo: 'bg-amber-500/10 border-amber-500/50 text-amber-700' },
  { valor: 'NAO', label: 'Não', ativo: 'bg-red-500/10 border-red-500/50 text-red-700' },
]

const ROTULO_NOTA = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente']

export function AvaliacaoCliente({ token, origem }: { token: string; origem: 'qr' | 'whatsapp' }) {
  const [dados, setDados] = useState<DadosAvaliacao | null>(null)
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)
  const [nota, setNota] = useState(0)
  const [resolvido, setResolvido] = useState<Resolucao | null>(null)
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    fetch(`/api/avaliacao/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Não foi possível abrir a avaliação')
        setDados(body)
      })
      .catch((e) => setErroCarregar(e.message))
  }, [token])

  async function enviar() {
    if (!nota) return setErro('Escolha uma nota de 1 a 5 estrelas')
    if (!resolvido) return setErro('Diga se o problema foi resolvido')
    setErro(null)
    setEnviando(true)
    try {
      const res = await fetch(`/api/avaliacao/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota, problemaResolvido: resolvido, comentario: comentario.trim() || null, origem }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Não foi possível enviar a avaliação')
      setEnviado(true)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-tema-fundo flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-tema-superficie border border-tema-linha rounded-2xl shadow-sm p-5 space-y-5">
        <div className="text-center">
          <p className="text-sm font-bold text-orange-600">GTS Center</p>
          <h1 className="text-xl font-bold text-tema-tinta mt-1">Como foi seu atendimento?</h1>
          {dados && (
            <p className="text-sm text-tema-suave mt-1">
              {[dados.tipo, dados.dataAtendimento ? `em ${formatDateTime(dados.dataAtendimento)}` : null, dados.equipe]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        {!dados && !erroCarregar && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-tema-apagado" />
          </div>
        )}

        {erroCarregar && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {erroCarregar}
          </div>
        )}

        {dados && (dados.status !== 'PENDENTE' || enviado) && (
          <div className="text-center py-6 space-y-2">
            <CheckCircle className={cn('w-10 h-10 mx-auto', dados.status === 'EXPIRADA' && !enviado ? 'text-tema-apagado' : 'text-emerald-600')} />
            <p className="font-bold text-tema-tinta">
              {enviado || dados.status === 'RESPONDIDA' ? 'Obrigado pela sua avaliação' : 'Este link de avaliação expirou'}
            </p>
            <p className="text-sm text-tema-suave">
              {enviado || dados.status === 'RESPONDIDA'
                ? 'Sua opinião ajuda a GTSNET a melhorar cada atendimento.'
                : 'Se precisar, fale com a GTSNET pelos canais de atendimento.'}
            </p>
          </div>
        )}

        {dados && dados.status === 'PENDENTE' && !enviado && (
          <>
            <div className="text-center">
              <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Nota de 1 a 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={nota === n}
                    aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                    onClick={() => { setNota(n); setErro(null) }}
                    className="p-1"
                  >
                    <Star className={cn('w-9 h-9', n <= nota ? 'fill-amber-400 text-amber-400' : 'text-tema-linha-forte')} />
                  </button>
                ))}
              </div>
              <p className="text-xs text-tema-apagado mt-1 h-4">{nota ? ROTULO_NOTA[nota] : 'Toque nas estrelas'}</p>
            </div>

            <div>
              <p className="text-sm font-bold text-tema-tinta mb-2">O problema foi resolvido?</p>
              <div className="grid grid-cols-3 gap-2">
                {OPCOES_RESOLUCAO.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => { setResolvido(o.valor); setErro(null) }}
                    className={cn(
                      'py-2.5 rounded-xl border text-sm font-medium transition-colors',
                      resolvido === o.valor ? o.ativo : 'border-tema-linha-forte text-tema-suave hover:bg-tema-contraste/[0.02]'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="comentario" className="block text-sm text-tema-suave mb-1.5">
                Quer comentar algo? (opcional)
              </label>
              <textarea
                id="comentario"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Conte como foi o atendimento"
                className="w-full bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2.5 text-sm text-tema-tinta placeholder:text-tema-apagado focus:outline-none focus:ring-1 focus:ring-orange-600 focus:border-orange-600 resize-none"
              />
            </div>

            {erro && <p className="text-sm text-red-700">{erro}</p>}

            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
            >
              {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
              {enviando ? 'Enviando…' : 'Enviar avaliação'}
            </button>

            <p className="text-[11px] text-tema-apagado text-center">
              Registramos o endereço IP deste acesso para garantir que a avaliação é verdadeira.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
