'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  X, Loader2, Activity, Wifi, Gauge, Timer, Globe, Radio,
  CheckCircle, AlertTriangle, XCircle, RotateCcw, ClipboardCheck, MapPin,
} from 'lucide-react'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface Props {
  chamado: any
  onClose: () => void
  // Diagnostico REMOTO do NOC (se existir) - mostrado ao tecnico antes do seu
  // proprio teste, e validado ao final do atendimento (secoes 24-25).
  diagnosticoRemoto?: any
}

type StatusEtapa = 'pendente' | 'rodando' | 'ok' | 'atencao' | 'problema' | 'indisponivel' | 'erro'

interface Etapa {
  id: string
  label: string
  icone: React.ElementType
  status: StatusEtapa
  resumo?: string
}

const CLASSIFICACAO_CFG: Record<string, { label: string; cor: string; icone: React.ElementType }> = {
  NORMAL:             { label: 'Conexao Normal',        cor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icone: CheckCircle },
  ATENCAO:            { label: 'Atencao',               cor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',   icone: AlertTriangle },
  POSSIVEL_PROBLEMA:  { label: 'Possivel Problema',     cor: 'text-orange-400 bg-orange-500/10 border-orange-500/30',  icone: AlertTriangle },
  PROBLEMA:           { label: 'Problema Identificado', cor: 'text-red-400 bg-red-500/10 border-red-500/30',           icone: XCircle },
  INDETERMINADO:      { label: 'Nao foi possivel determinar', cor: 'text-gray-400 bg-gray-500/10 border-gray-500/30',  icone: AlertTriangle },
}

const ORIGEM_LABEL: Record<string, string> = {
  WIFI: 'Wi-Fi', DISPOSITIVO: 'Dispositivo do cliente', ROTEADOR: 'Roteador', ONU_ONT: 'ONU/ONT',
  FIBRA: 'Fibra', SINAL_OPTICO: 'Sinal Optico', REDE_LOCAL: 'Rede Local', REDE_GTSNET: 'Rede GTSNET',
  DNS: 'DNS', ROTA_EXTERNA: 'Rota Externa', SERVIDOR: 'Servidor', INDETERMINADO: 'Indeterminado',
}

const STATUS_COR: Record<StatusEtapa, string> = {
  pendente:     'text-gray-600',
  rodando:      'text-blue-400',
  ok:           'text-emerald-400',
  atencao:      'text-yellow-400',
  problema:     'text-red-400',
  indisponivel: 'text-gray-500',
  erro:         'text-red-400',
}

function comTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function media(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

async function medirRtt(destino: 'gtsnet' | 'externo', amostras: number) {
  const tempos: number[] = []
  let falhas = 0
  for (let i = 0; i < amostras; i++) {
    const inicio = performance.now()
    try {
      if (destino === 'gtsnet') {
        await comTimeout(fetch('/api/diagnostico/speedtest/ping', { cache: 'no-store' }), 4000)
      } else {
        await comTimeout(fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store', mode: 'no-cors' }), 4000)
      }
      tempos.push(performance.now() - inicio)
    } catch {
      falhas++
    }
  }
  return { tempos, falhas, amostras }
}

export function DiagnosticoRunner({ chamado, onClose, diagnosticoRemoto }: Props) {
  const { data: session } = useSession()
  const [fase, setFase] = useState<'inicio' | 'rodando' | 'resultado' | 'atendimento'>('inicio')
  const [diagnosticoId, setDiagnosticoId] = useState<string | null>(null)
  const [faseAtual, setFaseAtual] = useState<'ANTES' | 'DEPOIS'>('ANTES')
  const [temAnteriorPendente, setTemAnteriorPendente] = useState(false)
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const [etapas, setEtapas] = useState<Etapa[]>([
    { id: 'REDE_LOCAL',      label: 'Identificando rede local',        icone: Wifi,   status: 'pendente' },
    { id: 'VELOCIDADE',      label: 'Medindo velocidade',              icone: Gauge,  status: 'pendente' },
    { id: 'LATENCIA',        label: 'Medindo latencia e estabilidade', icone: Timer,  status: 'pendente' },
    { id: 'DNS',             label: 'Testando resolucao DNS',          icone: Globe,  status: 'pendente' },
    { id: 'ONU_SINAL',       label: 'Consultando equipamento e sinal', icone: Radio,  status: 'pendente' },
  ])
  const [resultado, setResultado] = useState<any>(null)
  const [acoesMarcadas, setAcoesMarcadas] = useState<Record<number, boolean>>({})

  // Registro de atendimento (formulario final)
  const [problemaEncontrado, setProblemaEncontrado] = useState('')
  const [acaoRealizada, setAcaoRealizada] = useState('')
  const [equipamentoSubstituido, setEquipamentoSubstituido] = useState(false)
  const [equipamentoAntigoDesc, setEquipamentoAntigoDesc] = useState('')
  const [equipamentoNovoDesc, setEquipamentoNovoDesc] = useState('')
  const [resultadoFinal, setResultadoFinal] = useState('')
  const [enviandoAtendimento, setEnviandoAtendimento] = useState(false)
  // Validacao do diagnostico REMOTO do NOC (so existe quando diagnosticoRemoto existe)
  const [validacaoTecnico, setValidacaoTecnico] = useState('')
  const [causaReal, setCausaReal] = useState('')

  useEffect(() => {
    async function verificarAnterior() {
      try {
        const res = await fetch(`/api/tickets/${chamado.id}/diagnosticos`)
        if (res.ok) {
          const lista = await res.json()
          const semPar = lista.find((d: any) => d.fase === 'ANTES' && !lista.some((x: any) => x.diagnosticoAnteriorId === d.id))
          setTemAnteriorPendente(!!semPar)
        }
      } catch {
        // silencioso - so afeta o texto do botao inicial
      } finally {
        setCarregandoHistorico(false)
      }
    }
    verificarAnterior()
  }, [chamado.id])

  function atualizarEtapa(id: string, status: StatusEtapa, resumo?: string) {
    setEtapas(prev => prev.map(e => e.id === id ? { ...e, status, resumo } : e))
  }

  async function iniciar() {
    setFase('rodando')

    try {
      const resCriar = await fetch('/api/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chamadoId: chamado.id, dispositivoUtilizado: navigator.userAgent }),
      })
      if (!resCriar.ok) throw new Error()
      const criado = await resCriar.json()
      setDiagnosticoId(criado.id)
      setFaseAtual(criado.fase)

      const testesColetados: any[] = []

      // 1. Rede local - so o que o navegador realmente expoe
      atualizarEtapa('REDE_LOCAL', 'rodando')
      try {
        const conn = (navigator as any).connection
        const detalhes = {
          online: navigator.onLine,
          effectiveType: conn?.effectiveType ?? null,
          downlinkMbps: conn?.downlink ?? null,
          rttMs: conn?.rtt ?? null,
        }
        const status = !navigator.onLine ? 'PROBLEMA' : 'OK'
        testesColetados.push({ tipo: 'REDE_LOCAL', status, detalhes })
        atualizarEtapa('REDE_LOCAL', status === 'OK' ? 'ok' : 'problema', conn ? `${conn.effectiveType || ''}` : 'Info parcial do navegador')
      } catch {
        testesColetados.push({ tipo: 'REDE_LOCAL', status: 'INDISPONIVEL', erro: 'Nao suportado neste navegador' })
        atualizarEtapa('REDE_LOCAL', 'indisponivel', 'Informacao nao disponivel neste dispositivo')
      }

      // 2. Velocidade (download + upload reais contra o servidor GTSNET)
      atualizarEtapa('VELOCIDADE', 'rodando')
      try {
        const inicioDown = performance.now()
        const resDown = await comTimeout(fetch('/api/diagnostico/speedtest/download?mb=5', { cache: 'no-store' }), 15000)
        const blob = await resDown.blob()
        const duracaoDownSeg = (performance.now() - inicioDown) / 1000
        const downloadMbps = (blob.size * 8) / duracaoDownSeg / 1_000_000

        const payload = new Blob([new Uint8Array(2 * 1024 * 1024)])
        const inicioUp = performance.now()
        await comTimeout(fetch('/api/diagnostico/speedtest/upload', { method: 'POST', body: payload }), 15000)
        const duracaoUpSeg = (performance.now() - inicioUp) / 1000
        const uploadMbps = (payload.size * 8) / duracaoUpSeg / 1_000_000

        testesColetados.push({
          tipo: 'VELOCIDADE', status: 'OK', valor: downloadMbps, unidade: 'Mbps',
          detalhes: { download: downloadMbps, upload: uploadMbps },
        })
        atualizarEtapa('VELOCIDADE', 'ok', `${downloadMbps.toFixed(0)} Mbps down / ${uploadMbps.toFixed(0)} Mbps up`)
      } catch {
        testesColetados.push({ tipo: 'VELOCIDADE', status: 'ERRO', erro: 'Falha ao medir velocidade' })
        atualizarEtapa('VELOCIDADE', 'erro', 'Nao foi possivel concluir este teste')
      }

      // 3. Latencia / jitter / perda (HTTP, nao ICMP)
      atualizarEtapa('LATENCIA', 'rodando')
      try {
        const [gtsnet, externo] = await Promise.all([medirRtt('gtsnet', 8), medirRtt('externo', 8)])
        const gtsnetMs = media(gtsnet.tempos)
        const externaMs = media(externo.tempos)
        let jitterMs: number | null = null
        if (gtsnet.tempos.length > 1) {
          const diffs = gtsnet.tempos.slice(1).map((t, i) => Math.abs(t - gtsnet.tempos[i]))
          jitterMs = media(diffs)
        }
        const totalAmostras = gtsnet.amostras + externo.amostras
        const totalFalhas = gtsnet.falhas + externo.falhas
        const perdaPct = totalAmostras ? (totalFalhas / totalAmostras) * 100 : null

        testesColetados.push({ tipo: 'LATENCIA', status: 'OK', valor: gtsnetMs, unidade: 'ms', detalhes: { gtsnetMs, externaMs } })
        testesColetados.push({ tipo: 'JITTER', status: 'OK', valor: jitterMs, unidade: 'ms' })
        testesColetados.push({ tipo: 'PERDA_PACOTES', status: 'OK', valor: perdaPct, unidade: '%' })

        const resumoTxt = `${gtsnetMs?.toFixed(0) ?? '-'} ms GTSNET / ${externaMs?.toFixed(0) ?? '-'} ms externo`
        atualizarEtapa('LATENCIA', (perdaPct ?? 0) > 3 ? 'problema' : (perdaPct ?? 0) > 0 ? 'atencao' : 'ok', resumoTxt)
      } catch {
        testesColetados.push({ tipo: 'LATENCIA', status: 'ERRO', erro: 'Falha ao medir latencia' })
        atualizarEtapa('LATENCIA', 'erro', 'Nao foi possivel concluir este teste')
      }

      // 4. DNS - por IP (sem resolucao de nome) vs por hostname
      atualizarEtapa('DNS', 'rodando')
      try {
        let porIpOk = false
        let porNomeOk = false
        try { await comTimeout(fetch('https://1.1.1.1/cdn-cgi/trace', { mode: 'no-cors', cache: 'no-store' }), 4000); porIpOk = true } catch {}
        try { await comTimeout(fetch('https://www.cloudflare.com/cdn-cgi/trace', { mode: 'no-cors', cache: 'no-store' }), 4000); porNomeOk = true } catch {}

        const status = porNomeOk ? 'OK' : (porIpOk ? 'PROBLEMA' : 'INDISPONIVEL')
        testesColetados.push({ tipo: 'DNS', status, detalhes: { porIpOk, porNomeOk } })
        atualizarEtapa('DNS', status === 'OK' ? 'ok' : status === 'PROBLEMA' ? 'problema' : 'indisponivel',
          status === 'PROBLEMA' ? 'Resolucao de nomes com falha' : undefined)
      } catch {
        testesColetados.push({ tipo: 'DNS', status: 'ERRO', erro: 'Falha ao testar DNS' })
        atualizarEtapa('DNS', 'erro', 'Nao foi possivel concluir este teste')
      }

      // 5. ONU / sinal optico - feito no servidor (chave do SmartOLT nunca vai pro navegador)
      atualizarEtapa('ONU_SINAL', 'rodando')
      const resTestes = await fetch(`/api/diagnostico/${criado.id}/testes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testes: testesColetados }),
      })

      if (!resTestes.ok) throw new Error('Falha ao registrar os resultados do diagnostico')
      await resTestes.json()

      const onuTeste = (await (await fetch(`/api/diagnostico/${criado.id}`)).json())
      const sinalTeste = onuTeste.testes?.find((t: any) => t.tipo === 'SINAL_OPTICO')
      atualizarEtapa('ONU_SINAL', sinalTeste?.status === 'INDISPONIVEL' ? 'indisponivel' : sinalTeste?.status === 'PROBLEMA' ? 'problema' : sinalTeste?.status === 'ATENCAO' ? 'atencao' : 'ok',
        sinalTeste?.valor != null ? `Sinal: ${sinalTeste.valor.toFixed(1)} dBm` : 'Sem ONU vinculada a este chamado')

      setResultado(onuTeste)
      setFase('resultado')
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao executar diagnostico', variant: 'destructive' })
      setFase('inicio')
    }
  }

  async function enviarAtendimento() {
    if (!diagnosticoId) return
    if (!problemaEncontrado || !acaoRealizada.trim() || !resultadoFinal) {
      toast({ title: 'Preencha problema, acao realizada e resultado', variant: 'destructive' })
      return
    }
    if (diagnosticoRemoto && !validacaoTecnico) {
      toast({ title: 'Informe se o diagnostico do NOC estava correto', variant: 'destructive' })
      return
    }
    setEnviandoAtendimento(true)
    try {
      const res = await fetch(`/api/diagnostico/${diagnosticoId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemaEncontrado, acaoRealizada,
          equipamentoSubstituido, equipamentoAntigoDesc, equipamentoNovoDesc,
          resultadoFinal,
        }),
      })
      if (!res.ok) throw new Error()

      if (diagnosticoRemoto) {
        await fetch(`/api/diagnostico/${diagnosticoRemoto.id}/validar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ validacaoTecnico, causaReal: causaReal || undefined }),
        }).catch(() => {})
      }

      toast({ title: 'Atendimento registrado!', variant: 'success' })
      onClose()
    } catch {
      toast({ title: 'Erro ao registrar atendimento', variant: 'destructive' })
    } finally {
      setEnviandoAtendimento(false)
    }
  }

  function executarNovamente() {
    setFase('inicio')
    setDiagnosticoId(null)
    setResultado(null)
    setEtapas(prev => prev.map(e => ({ ...e, status: 'pendente', resumo: undefined })))
  }

  const classCfg = resultado?.classificacao ? CLASSIFICACAO_CFG[resultado.classificacao] : null
  const anterior = resultado?.diagnosticoAnterior

  return (
    <div className="fixed inset-0 bg-black/85 z-[60] flex items-end sm:items-center justify-center">
      <div className="bg-[#0B1120] w-full sm:max-w-lg sm:rounded-2xl h-[95vh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#111827] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-white font-bold">Diagnostico Tecnico</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2.5 -m-1 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {fase === 'inicio' && (
            <>
              <div className="bg-[#111827] border border-white/5 rounded-xl p-4 space-y-1.5">
                <p className="text-white font-semibold">{chamado.cliente}</p>
                <p className="text-sm text-gray-400 flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {formatarEnderecoCompleto(chamado)}
                </p>
                <p className="text-xs text-gray-500">Tecnico: {session?.user?.name || '-'}</p>
                <p className="text-xs text-gray-500">OS: {chamado.id.slice(0, 8)}</p>
              </div>

              {diagnosticoRemoto && (
                <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-1">
                  <p className="text-xs text-cyan-400 font-bold">Diagnostico do NOC (antes do despacho)</p>
                  <p className="text-sm text-gray-200">
                    {CLASSIFICACAO_CFG[diagnosticoRemoto.classificacao]?.label ?? diagnosticoRemoto.classificacao}
                    {diagnosticoRemoto.confianca != null ? ` (${diagnosticoRemoto.confianca}%)` : ''}
                  </p>
                  {diagnosticoRemoto.hipotese && <p className="text-xs text-gray-400">{diagnosticoRemoto.hipotese}</p>}
                </div>
              )}

              {!carregandoHistorico && temAnteriorPendente && (
                <div className="flex items-center gap-2 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <RotateCcw className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <p className="text-xs text-cyan-300">
                    Ja existe um diagnostico ANTES para esta OS. Este novo diagnostico sera registrado como DEPOIS e comparado automaticamente.
                  </p>
                </div>
              )}

              <button
                onClick={iniciar}
                className="w-full flex items-center justify-center gap-2 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors"
              >
                <Activity className="w-5 h-5" />
                {temAnteriorPendente ? 'Executar Novo Diagnostico' : 'Iniciar Diagnostico'}
              </button>
            </>
          )}

          {fase === 'rodando' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 mb-2">Analisando conexao...</p>
              {etapas.map(etapa => {
                const Icon = etapa.icone
                return (
                  <div key={etapa.id} className="flex items-center gap-3 p-3 bg-[#111827] border border-white/5 rounded-xl">
                    {etapa.status === 'rodando'
                      ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                      : etapa.status === 'pendente'
                      ? <Icon className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      : etapa.status === 'ok'
                      ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      : etapa.status === 'indisponivel'
                      ? <AlertTriangle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      : <AlertTriangle className={cn('w-4 h-4 flex-shrink-0', STATUS_COR[etapa.status])} />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', etapa.status === 'pendente' ? 'text-gray-500' : 'text-white')}>{etapa.label}</p>
                      {etapa.resumo && <p className="text-xs text-gray-500 truncate">{etapa.resumo}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {fase === 'resultado' && resultado && classCfg && (
            <div className="space-y-4">
              <div className={cn('flex items-center gap-3 p-4 rounded-xl border', classCfg.cor)}>
                <classCfg.icone className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="font-bold">{classCfg.label}</p>
                  <p className="text-xs opacity-80">Origem provavel: {ORIGEM_LABEL[resultado.origemProvavel] || resultado.origemProvavel}</p>
                </div>
              </div>

              {resultado.resumo && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {resultado.resumo.downloadMbps != null && (
                    <div className="bg-[#111827] border border-white/5 rounded-lg p-2">
                      <p className="text-lg font-bold text-white">{resultado.resumo.downloadMbps.toFixed(0)}</p>
                      <p className="text-[10px] text-gray-500">Mbps Download</p>
                    </div>
                  )}
                  {resultado.resumo.latenciaGtsnetMs != null && (
                    <div className="bg-[#111827] border border-white/5 rounded-lg p-2">
                      <p className="text-lg font-bold text-white">{resultado.resumo.latenciaGtsnetMs.toFixed(0)}</p>
                      <p className="text-[10px] text-gray-500">ms Latencia</p>
                    </div>
                  )}
                  {resultado.resumo.perdaPct != null && (
                    <div className="bg-[#111827] border border-white/5 rounded-lg p-2">
                      <p className="text-lg font-bold text-white">{resultado.resumo.perdaPct.toFixed(1)}%</p>
                      <p className="text-[10px] text-gray-500">Perda</p>
                    </div>
                  )}
                </div>
              )}

              {resultado.recomendacoes?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-300 mb-2">Recomendacoes</p>
                  <div className="space-y-1.5">
                    {resultado.recomendacoes.map((rec: string, i: number) => (
                      <button
                        key={i}
                        onClick={() => setAcoesMarcadas(prev => ({ ...prev, [i]: !prev[i] }))}
                        className="w-full flex items-start gap-2 p-2.5 bg-[#111827] border border-white/5 rounded-lg text-left"
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                          acoesMarcadas[i] ? 'bg-cyan-500 border-cyan-500' : 'border-gray-600'
                        )}>
                          {acoesMarcadas[i] && <CheckCircle className="w-3 h-3 text-black" />}
                        </div>
                        <span className={cn('text-xs', acoesMarcadas[i] ? 'text-gray-500 line-through' : 'text-gray-300')}>{rec}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {anterior && (
                <div>
                  <p className="text-sm font-medium text-gray-300 mb-2">Antes x Depois</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left pb-1">Metrica</th>
                          <th className="text-right pb-1">Antes</th>
                          <th className="text-right pb-1">Depois</th>
                        </tr>
                      </thead>
                      <tbody className="text-white">
                        {[
                          { label: 'Download', campo: 'downloadMbps', unidade: ' Mbps', maior: true },
                          { label: 'Latencia GTSNET', campo: 'latenciaGtsnetMs', unidade: ' ms', maior: false },
                          { label: 'Jitter', campo: 'jitterMs', unidade: ' ms', maior: false },
                          { label: 'Perda', campo: 'perdaPct', unidade: '%', maior: false },
                        ].map(m => {
                          const antesV = anterior.resumo?.[m.campo]
                          const depoisV = resultado.resumo?.[m.campo]
                          const melhorou = antesV != null && depoisV != null
                            ? (m.maior ? depoisV >= antesV : depoisV <= antesV)
                            : null
                          return (
                            <tr key={m.campo} className="border-t border-white/5">
                              <td className="py-1.5">{m.label}</td>
                              <td className="text-right py-1.5">{antesV != null ? `${antesV.toFixed(1)}${m.unidade}` : '-'}</td>
                              <td className="text-right py-1.5 flex items-center justify-end gap-1">
                                {depoisV != null ? `${depoisV.toFixed(1)}${m.unidade}` : '-'}
                                {melhorou === true && <span className="text-emerald-400">✓</span>}
                                {melhorou === false && <span className="text-red-400">!</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                {faseAtual === 'ANTES' && (
                  <button
                    onClick={executarNovamente}
                    className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-white transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Executar Depois
                  </button>
                )}
                <button
                  onClick={() => setFase('atendimento')}
                  className={cn('flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors', faseAtual !== 'ANTES' && 'col-span-2')}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  Registrar Atendimento
                </button>
              </div>
            </div>
          )}

          {fase === 'atendimento' && (
            <div className="space-y-4">
              {diagnosticoRemoto && (
                <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-3">
                  <p className="text-xs text-cyan-400 font-bold">O diagnostico do NOC estava correto?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { valor: 'CONFIRMADO', label: 'Confirmado' },
                      { valor: 'PARCIAL', label: 'Parcialmente' },
                      { valor: 'INCORRETO', label: 'Incorreto' },
                      { valor: 'INCONCLUSIVO', label: 'Inconclusivo' },
                    ].map(op => (
                      <button
                        key={op.valor}
                        type="button"
                        onClick={() => setValidacaoTecnico(op.valor)}
                        className={cn(
                          'py-2 rounded-lg text-xs font-medium border transition-colors',
                          validacaoTecnico === op.valor
                            ? 'bg-cyan-500 border-cyan-500 text-black'
                            : 'bg-[#111827] border-white/10 text-gray-300'
                        )}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Causa real</label>
                    <select
                      value={causaReal}
                      onChange={e => setCausaReal(e.target.value)}
                      className="w-full bg-[#111827] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="">Selecione...</option>
                      <option value="WIFI">Wi-Fi</option>
                      <option value="ROTEADOR">Roteador</option>
                      <option value="ONU">ONU</option>
                      <option value="FIBRA">Fibra</option>
                      <option value="SINAL">Sinal</option>
                      <option value="CONFIGURACAO">Configuracao</option>
                      <option value="REDE">Rede</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Problema encontrado *</label>
                <select
                  value={problemaEncontrado}
                  onChange={e => setProblemaEncontrado(e.target.value)}
                  className="w-full bg-[#111827] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                >
                  <option value="">Selecione...</option>
                  <option value="WIFI">Wi-Fi</option>
                  <option value="ROTEADOR">Roteador</option>
                  <option value="ONU">ONU</option>
                  <option value="FIBRA">Fibra</option>
                  <option value="SINAL">Sinal</option>
                  <option value="CONFIGURACAO">Configuracao</option>
                  <option value="REDE">Rede</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Acao realizada *</label>
                <textarea
                  value={acaoRealizada}
                  onChange={e => setAcaoRealizada(e.target.value)}
                  rows={3}
                  placeholder="Descreva o que foi feito..."
                  className="w-full bg-[#111827] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 resize-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                  <input
                    type="checkbox"
                    checked={equipamentoSubstituido}
                    onChange={e => setEquipamentoSubstituido(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Equipamento substituido?
                </label>
                {equipamentoSubstituido && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={equipamentoAntigoDesc}
                      onChange={e => setEquipamentoAntigoDesc(e.target.value)}
                      placeholder="Equipamento antigo"
                      className="bg-[#111827] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600"
                    />
                    <input
                      value={equipamentoNovoDesc}
                      onChange={e => setEquipamentoNovoDesc(e.target.value)}
                      placeholder="Equipamento novo"
                      className="bg-[#111827] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Resultado *</label>
                <select
                  value={resultadoFinal}
                  onChange={e => setResultadoFinal(e.target.value)}
                  className="w-full bg-[#111827] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                >
                  <option value="">Selecione...</option>
                  <option value="RESOLVIDO">Resolvido</option>
                  <option value="RESOLVIDO_PARCIAL">Resolvido parcialmente</option>
                  <option value="NAO_RESOLVIDO">Nao resolvido</option>
                  <option value="ESCALAR">Necessario escalar</option>
                  <option value="RETORNO">Necessario retorno</option>
                </select>
              </div>

              <button
                onClick={enviarAtendimento}
                disabled={enviandoAtendimento || (!!diagnosticoRemoto && !validacaoTecnico)}
                className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {enviandoAtendimento ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                Concluir Diagnostico
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
