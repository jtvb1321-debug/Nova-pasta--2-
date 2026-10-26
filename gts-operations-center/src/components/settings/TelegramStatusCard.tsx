'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Send, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { DiagnosticoTelegram } from '@/lib/telegram'

// Confere o Telegram em producao (variaveis, bot, grupo e permissao) e envia uma mensagem de teste. So ADMIN.

function Linha({ ok, titulo, detalhe }: { ok: boolean; titulo: string; detalhe?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" aria-hidden />}
      <span><span className="font-medium text-tema-tinta">{titulo}</span>{detalhe && <span className="text-tema-suave"> · {detalhe}</span>}</span>
    </li>
  )
}

export function TelegramStatusCard() {
  const [d, setD] = useState<DiagnosticoTelegram | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function verificar() {
    setVerificando(true)
    try {
      const r = await fetch('/api/telegram/status', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Não foi possível verificar.')
      setD(j)
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }) } finally { setVerificando(false) }
  }
  async function enviarTeste() {
    setEnviando(true)
    try {
      const r = await fetch('/api/telegram/teste', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'O Telegram recusou a mensagem de teste.')
      toast({ title: 'Teste enviado ao grupo de O.S.', variant: 'success' })
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }) } finally { setEnviando(false) }
  }

  const tudoOk = d && d.tokenConfigurado && d.grupoConfigurado && d.bot.ok && d.grupo.ok && d.botNoGrupo.ok
  return (
    <div className="card-orbia space-y-3 p-5">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-orange-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-tema-tinta">Notificações no Telegram</p>
          <p className="mt-0.5 text-xs text-tema-suave">Confere se o bot e o grupo de O.S. estão configurados neste servidor e se o bot pode escrever no grupo. A verificação não envia nada; o teste envia uma mensagem marcada como teste.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={verificar} disabled={verificando} className="gts-btn-secondary min-h-[40px] text-sm disabled:opacity-60">{verificando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Verificar Telegram</button>
        <button type="button" onClick={enviarTeste} disabled={enviando} className="gts-btn-primary min-h-[40px] text-sm disabled:opacity-60">{enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Enviar mensagem de teste</button>
      </div>
      {d && (
        <ul className="space-y-1.5 rounded-lg border border-tema-linha p-3" aria-live="polite">
          <Linha ok={d.tokenConfigurado} titulo="Token do bot (TELEGRAM_BOT_TOKEN)" detalhe={d.tokenConfigurado ? 'configurado' : 'NÃO configurado neste servidor'} />
          <Linha ok={d.grupoConfigurado} titulo="Grupo de O.S. (TELEGRAM_GROUP_OS)" detalhe={d.grupoConfigurado ? 'configurado' : 'NÃO configurado neste servidor'} />
          <Linha ok={d.bot.ok} titulo="Bot" detalhe={d.bot.ok ? `@${d.bot.usuario}` : d.bot.erro} />
          <Linha ok={d.grupo.ok} titulo="Grupo" detalhe={d.grupo.ok ? `${d.grupo.titulo} (${d.grupo.tipo})` : d.grupo.erro} />
          <Linha ok={d.botNoGrupo.ok} titulo="Bot no grupo" detalhe={d.botNoGrupo.ok ? `${d.botNoGrupo.situacao}, pode enviar` : d.botNoGrupo.erro} />
          <li className="pt-1 text-xs text-tema-suave">{tudoOk ? 'Tudo certo: se mesmo assim algo não chegar, veja na Auditoria os registros "TELEGRAM_FALHA".' : 'Corrija o item em vermelho (as variáveis ficam no painel da Discloud) e verifique de novo.'}</li>
        </ul>
      )}
    </div>
  )
}
