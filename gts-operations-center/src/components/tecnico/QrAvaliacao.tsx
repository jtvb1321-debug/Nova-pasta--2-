'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CheckCircle, Loader2, MessageCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  chamado: { id: string; cliente: string; tipo: string; telefone?: string | null }
  tipoLabel: string
  token: string
  onConcluir: () => void
}

// Mostrada ao tecnico logo depois de finalizar: o cliente escaneia o QR e
// avalia na hora, numa pagina publica do GTS Center. O link sempre usa o
// endereco por onde o tecnico acessa o sistema (o mesmo dominio publico).
export function QrAvaliacao({ chamado, tipoLabel, token, onConcluir }: Props) {
  const [svg, setSvg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false)

  const link = `${window.location.origin}/avaliar/${token}?origem=qr`

  useEffect(() => {
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then(setSvg)
      .catch(() => setSvg(null))
  }, [link])

  async function enviarWhatsApp() {
    setEnviando(true)
    try {
      const res = await fetch(`/api/tickets/${chamado.id}/avaliacao/whatsapp`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Nao foi possivel enviar')
      setEnviadoWhatsApp(true)
      toast({ title: 'Link de avaliacao enviado ao cliente pelo WhatsApp', variant: 'success' })
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
        <p className="text-lg font-bold text-tema-tinta mt-1">Atendimento finalizado</p>
        <p className="text-sm text-tema-suave">{tipoLabel} · {chamado.cliente}</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="w-56 h-56 bg-tema-superficie border border-tema-linha-forte rounded-xl p-2 flex items-center justify-center">
          {svg
            ? <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
            : <Loader2 className="w-6 h-6 animate-spin text-tema-apagado" />}
        </div>
        <p className="text-sm font-bold text-tema-tinta">Peça ao cliente para avaliar</p>
        <p className="text-xs text-tema-suave text-center">Ele aponta a câmera do celular para o código e responde em menos de 1 minuto.</p>
      </div>

      <div className="space-y-2">
        {chamado.telefone && (
          <button
            onClick={enviarWhatsApp}
            disabled={enviando || enviadoWhatsApp}
            className="w-full flex items-center justify-center gap-2 py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/25 text-green-700 font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            {enviadoWhatsApp ? 'Link enviado pelo WhatsApp' : 'Enviar por WhatsApp'}
          </button>
        )}
        <button
          onClick={onConcluir}
          className="w-full py-3.5 bg-tema-tinta hover:bg-tema-texto text-tema-superficie font-bold rounded-xl transition-colors"
        >
          Concluir
        </button>
      </div>
    </div>
  )
}
