'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, ShieldCheck, ShieldAlert, Repeat, Loader2 } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

function formatarDuracao(minutos: number | null | undefined) {
  if (minutos == null) return '—'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

const LABEL_RESOLUCAO: Record<string, { label: string; cls: string }> = {
  SIM: { label: 'Problema resolvido', cls: 'text-emerald-700 bg-emerald-500/10' },
  PARCIAL: { label: 'Resolvido em parte', cls: 'text-amber-700 bg-amber-500/10' },
  NAO: { label: 'Problema não resolvido', cls: 'text-red-700 bg-red-500/10' },
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('w-4 h-4', n <= nota ? 'fill-amber-400 text-amber-400' : 'text-tema-linha-forte')} />
      ))}
    </span>
  )
}

function SlaBox({ titulo, valor, detalhe, dentro }: { titulo: string; valor: string; detalhe?: string; dentro?: boolean | null }) {
  return (
    <div className="bg-tema-contraste/[0.02] rounded-lg px-3 py-2">
      <p className="text-xs text-tema-apagado">{titulo}</p>
      <p className={cn('text-sm font-bold', dentro === false ? 'text-red-700' : 'text-tema-tinta')}>{valor}</p>
      {detalhe && <p className="text-[11px] text-tema-apagado">{detalhe}</p>}
    </div>
  )
}

function useRole() {
  const { data: session } = useSession()
  return (session?.user as any)?.role as string | undefined
}

// Bloco de fechamento dentro do card do chamado finalizado: SLA, avaliacao do
// cliente e, so para ADMIN/GESTOR, a auditoria da avaliacao (IP de quem abriu
// o QR e de quem enviou). Bonificacao nunca aparece aqui.
export function FechamentoChamado({ chamado }: { chamado: any }) {
  const role = useRole()
  const podeAuditar = role === 'ADMIN' || role === 'GESTOR'
  const avaliacao = chamado.avaliacao
  const respondida = !!avaliacao?.respondidoEm
  const resolucao = avaliacao?.problemaResolvido ? LABEL_RESOLUCAO[avaliacao.problemaResolvido] : null
  const inicioSla = chamado.inicioSla ?? chamado.dataAbertura
  const slaAgendado = chamado.inicioSla && new Date(chamado.inicioSla).getTime() !== new Date(chamado.dataAbertura).getTime()

  const { data: auditoria, isLoading: carregandoAuditoria } = useQuery({
    queryKey: ['avaliacao-auditoria', chamado.id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${chamado.id}/avaliacao`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: podeAuditar && respondida,
    retry: false,
  })

  return (
    <div className="bg-tema-contraste/[0.02] border border-tema-linha rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-tema-texto">Fechamento do chamado</p>
        <div className="flex gap-1.5 flex-wrap">
          {chamado.dentroSlaResolucao != null && (
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
              chamado.dentroSlaResolucao ? 'text-emerald-700 bg-emerald-500/10' : 'text-red-700 bg-red-500/10')}>
              {chamado.dentroSlaResolucao ? 'Dentro do SLA' : 'Fora do SLA'}
            </span>
          )}
          {resolucao && <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resolucao.cls)}>{resolucao.label}</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SlaBox
          titulo="Início do SLA"
          valor={new Date(inicioSla).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          detalhe={slaAgendado ? 'pelo agendamento' : 'pela abertura'}
        />
        <SlaBox titulo="Resposta" valor={formatarDuracao(chamado.slaRespostaMinutos)} detalhe="meta 2h" dentro={chamado.dentroSlaResposta} />
        <SlaBox titulo="Resolução" valor={formatarDuracao(chamado.slaResolucaoMinutos)} dentro={chamado.dentroSlaResolucao} />
      </div>

      <div>
        <p className="text-xs text-tema-apagado mb-1">Avaliação do cliente</p>
        {respondida ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Estrelas nota={avaliacao.nota} />
              <span className="text-sm font-bold text-tema-tinta">{avaliacao.nota},0</span>
              {avaliacao.canal && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700">
                  via {avaliacao.canal === 'WHATSAPP' ? 'WhatsApp' : 'QR code'}
                </span>
              )}
              {avaliacao.statusAnalise && (
                <span className={cn('text-[11px] px-2 py-0.5 rounded-full',
                  avaliacao.statusAnalise === 'APROVADA' ? 'bg-emerald-500/10 text-emerald-700'
                    : avaliacao.statusAnalise === 'INVALIDADA' ? 'bg-red-500/10 text-red-700'
                    : 'bg-amber-500/10 text-amber-700')}>
                  {avaliacao.statusAnalise === 'APROVADA' ? 'Aprovada' : avaliacao.statusAnalise === 'INVALIDADA' ? 'Invalidada' : 'Aguardando análise'}
                </span>
              )}
            </div>
            {avaliacao.comentario && <p className="text-sm text-tema-texto italic">&quot;{avaliacao.comentario}&quot;</p>}
          </div>
        ) : (
          <p className="text-sm text-tema-suave">Aguardando a avaliação do cliente</p>
        )}
      </div>

      {podeAuditar && respondida && (
        <div className="border-t border-tema-linha pt-2 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-tema-apagado">Auditoria da avaliação</p>
            {auditoria && (
              auditoria.alertas.length === 0 ? (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">
                  <ShieldCheck className="w-3 h-3" /> Sem indício de fraude
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 font-medium">
                  <ShieldAlert className="w-3 h-3" /> Conferir
                </span>
              )
            )}
          </div>
          {carregandoAuditoria && <Loader2 className="w-4 h-4 animate-spin text-tema-apagado" />}
          {auditoria && (
            <div className="text-xs space-y-0.5">
              <LinhaAuditoria
                rotulo="QR aberto"
                valor={auditoria.primeiroAcessoEm
                  ? `${formatDateTime(auditoria.primeiroAcessoEm)} · IP ${auditoria.primeiroAcessoIp ?? '—'}`
                  : '—'}
              />
              {auditoria.primeiroAcessoUserAgent && (
                <LinhaAuditoria rotulo="Navegador" valor={resumirNavegador(auditoria.primeiroAcessoUserAgent)} />
              )}
              <LinhaAuditoria
                rotulo="Avaliação enviada"
                valor={`${formatDateTime(auditoria.respondidoEm)} · IP ${auditoria.respostaIp ?? '—'}`}
              />
              <LinhaAuditoria rotulo="IP de quem finalizou" valor={auditoria.ipFinalizacao ?? '—'} />
              <LinhaAuditoria rotulo="Aberturas do link" valor={String(auditoria.acessos)} />
              <LinhaAuditoria
                rotulo="IP igual ao do técnico"
                valor={auditoria.ipIgualAoDoTecnico ? 'Sim' : 'Não'}
                alerta={auditoria.ipIgualAoDoTecnico}
              />
              {auditoria.minutosAposFinalizar != null && (
                <LinhaAuditoria rotulo="Tempo entre finalizar e avaliar" valor={formatarDuracao(auditoria.minutosAposFinalizar)} />
              )}
              {auditoria.alertas.map((a: string) => (
                <p key={a} className="text-red-700">• {a}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LinhaAuditoria({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-tema-apagado">{rotulo}</span>
      <span className={cn('text-right font-mono', alerta ? 'text-red-700' : 'text-tema-texto')}>{valor}</span>
    </div>
  )
}

function resumirNavegador(ua: string) {
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Outro'
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Outro'
  return `${so}, ${nav}`
}

const LABEL_RECHAMADA: Record<string, { label: string; cls: string }> = {
  POSSIVEL: { label: 'Possível rechamada', cls: 'text-orange-700 bg-orange-500/10 border-orange-500/30' },
  CONFIRMADA: { label: 'Rechamada confirmada', cls: 'text-red-700 bg-red-500/10 border-red-500/30' },
  DESCARTADA: { label: 'Rechamada descartada', cls: 'text-tema-suave bg-tema-contraste/[0.04] border-tema-linha' },
}

export function statusRechamadaDoChamado(chamado: any): keyof typeof LABEL_RECHAMADA | null {
  return chamado.statusRechamada ?? (chamado.reincidente ? 'POSSIVEL' : null)
}

export function BadgeRechamada({ chamado }: { chamado: any }) {
  const status = statusRechamadaDoChamado(chamado)
  if (!status) return null
  const cfg = LABEL_RECHAMADA[status]
  return (
    <span
      className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-bold', cfg.cls)}
      title="O mesmo cliente teve outro chamado finalizado nos 7 dias anteriores"
    >
      <Repeat className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// Validacao do supervisor: so ADMIN/GESTOR confirma ou descarta, com motivo.
export function PainelRechamada({ chamado }: { chamado: any }) {
  const role = useRole()
  const podeValidar = role === 'ADMIN' || role === 'GESTOR'
  const status = statusRechamadaDoChamado(chamado)
  const [motivo, setMotivo] = useState('')
  const queryClient = useQueryClient()

  const validar = useMutation({
    mutationFn: async (decisao: 'CONFIRMADA' | 'DESCARTADA') => {
      const res = await fetch(`/api/tickets/${chamado.id}/rechamada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisao, motivo }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Erro ao validar rechamada')
      return body
    },
    onSuccess: (_, decisao) => {
      toast({ title: decisao === 'CONFIRMADA' ? 'Rechamada confirmada' : 'Rechamada descartada', variant: 'success' })
      setMotivo('')
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('chamados'),
      })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
    },
    onError: (e: any) => toast({ title: e.message, variant: 'destructive' }),
  })

  if (!status) return null

  return (
    <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold text-orange-800 flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> {LABEL_RECHAMADA[status].label}</p>
        {chamado.chamadoOrigemReincidenciaId && (
          <span className="text-[11px] text-tema-suave font-mono">origem #{chamado.chamadoOrigemReincidenciaId.slice(-6)}</span>
        )}
      </div>
      <p className="text-xs text-tema-suave">O mesmo cliente teve outro chamado finalizado nos 7 dias anteriores a esta abertura.</p>

      {status !== 'POSSIVEL' && (
        <p className="text-xs text-tema-texto">
          {chamado.rechamadaValidadaPor ? `${chamado.rechamadaValidadaPor} · ` : ''}
          {chamado.rechamadaValidadaEm ? formatDateTime(chamado.rechamadaValidadaEm) : ''}
          {chamado.rechamadaMotivo ? ` — ${chamado.rechamadaMotivo}` : ''}
        </p>
      )}

      {status === 'POSSIVEL' && podeValidar && (
        <div className="space-y-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo da decisão (obrigatório)"
            maxLength={500}
            className="w-full bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2 text-sm text-tema-tinta placeholder:text-tema-apagado focus:outline-none focus:ring-1 focus:ring-orange-600"
          />
          <div className="flex gap-2">
            <button
              onClick={() => validar.mutate('CONFIRMADA')}
              disabled={validar.isPending || motivo.trim().length < 3}
              className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-xs font-bold text-red-700 disabled:opacity-50"
            >
              Confirmar rechamada
            </button>
            <button
              onClick={() => validar.mutate('DESCARTADA')}
              disabled={validar.isPending || motivo.trim().length < 3}
              className="flex-1 py-2 bg-tema-contraste/[0.03] hover:bg-tema-contraste/[0.06] border border-tema-linha rounded-lg text-xs font-bold text-tema-texto disabled:opacity-50"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
