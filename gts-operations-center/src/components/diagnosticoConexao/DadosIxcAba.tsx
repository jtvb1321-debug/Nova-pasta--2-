'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, ExternalLink, Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CredenciaisConexao, DadosCompletosIxc } from '@/lib/diagnosticoConexao/dadosIxc'
import { NAO_DISPONIVEL } from '@/lib/diagnosticoConexao/tipos'

// Aba "Dados do IXC": todos os campos que o IXC tem (sem senhas e sem CPF/CNPJ), o acesso ao roteador do cliente e as senhas
// SOB DEMANDA (cada visualizacao e' auditada no servidor; a tela esconde sozinha depois de 60 s).

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir o pedido.')
  return corpo as T
}

export function DadosIxcAba({ cliente, contrato, login, chamadoId, podeVerSenhas }: { cliente: string; contrato: string; login: string | null; chamadoId: string | null; podeVerSenhas: boolean }) {
  const [dados, setDados] = useState<DadosCompletosIxc | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [cred, setCred] = useState<CredenciaisConexao | null>(null)
  const [buscandoSenhas, setBuscandoSenhas] = useState(false)
  const [erroSenhas, setErroSenhas] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(null); setDados(null); setCred(null)
    const q = new URLSearchParams({ cliente, contrato })
    if (login) q.set('login', login)
    if (chamadoId) q.set('chamado', chamadoId)
    chamar<DadosCompletosIxc>(`/api/diagnostico-conexao/dados-ixc?${q}`)
      .then(d => { if (vivo) setDados(d) }).catch((e: Error) => { if (vivo) setErro(e.message) }).finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false; if (temporizador.current) clearTimeout(temporizador.current) }
  }, [cliente, contrato, login, chamadoId])

  async function mostrarSenhas() {
    if (!login) return
    setBuscandoSenhas(true); setErroSenhas(null)
    try {
      const r = await chamar<{ credenciais: CredenciaisConexao }>('/api/diagnostico-conexao/credenciais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente, login, ...(chamadoId ? { chamado: chamadoId } : {}) }) })
      setCred(r.credenciais)
      if (temporizador.current) clearTimeout(temporizador.current)
      temporizador.current = setTimeout(() => setCred(null), 60_000)
    } catch (e) { setErroSenhas((e as Error).message) } finally { setBuscandoSenhas(false) }
  }
  function ocultar() { if (temporizador.current) clearTimeout(temporizador.current); setCred(null) }

  if (carregando) return <p className="flex items-center gap-2 text-sm text-tema-suave"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando todos os dados no IXC…</p>
  if (erro || !dados) return <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-sm text-amber-900">{NAO_DISPONIVEL}. {erro}</p>
  const r = dados.roteador
  const linhasSenha: [string, string | null][] = cred ? [['Senha PPPoE', cred.senhaPppoe], ['Usuário do roteador', cred.usuarioRoteador], ['Senha do roteador', cred.senhaRoteador1], ['Senha do roteador (2)', cred.senhaRoteador2], ['Senha do Wi-Fi', cred.senhaWifi], ['Senha do Wi-Fi 5 GHz', cred.senhaWifi5g]] : []

  return (
    <div className="space-y-5">
      <section aria-label="Acesso ao roteador" className="rounded-xl border border-tema-linha p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tema-suave">Acesso ao roteador do cliente</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {([['IPv4 atual', r.ip], ['Porta principal', r.portaPrincipal], ['Porta secundária', r.portaSecundaria], ['Tipo de acesso', r.tipoAcesso]] as [string, string | null][]).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-tema-apagado">{k}</dt><dd className={cn('font-medium', v ? 'text-tema-tinta' : 'text-tema-apagado')}>{v || NAO_DISPONIVEL}</dd></div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {r.urlPrincipal && <a href={r.urlPrincipal} target="_blank" rel="noopener noreferrer" className="gts-btn-secondary min-h-[40px] text-sm"><ExternalLink className="h-4 w-4" aria-hidden /> Abrir roteador ({r.urlPrincipal.replace(/^https?:\/\//, '')})</a>}
          {r.urlSecundaria && <a href={r.urlSecundaria} target="_blank" rel="noopener noreferrer" className="gts-btn-secondary min-h-[40px] text-sm"><ExternalLink className="h-4 w-4" aria-hidden /> Porta secundária</a>}
          {podeVerSenhas && login && (cred
            ? <button type="button" onClick={ocultar} className="gts-btn-secondary min-h-[40px] text-sm"><EyeOff className="h-4 w-4" aria-hidden /> Ocultar senhas</button>
            : <button type="button" onClick={mostrarSenhas} disabled={buscandoSenhas} className="gts-btn-primary min-h-[40px] text-sm disabled:opacity-60">{buscandoSenhas ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} Mostrar senhas</button>)}
        </div>
        {!r.urlPrincipal && <p className="mt-2 text-xs text-tema-apagado">Sem IPv4 ou porta válidos no IXC para montar o link.</p>}
        <p className="mt-2 text-[11px] text-tema-apagado">O link só abre se o seu computador alcança a rede do cliente (ex.: VPN ou rede interna da GTSNET). O GTS Center não acessa o roteador por você.</p>
        <p className="mt-1 flex items-start gap-1 text-[11px] text-tema-apagado"><Lock className="mt-px h-3 w-3 flex-shrink-0" aria-hidden /> Senhas ficam ocultas: cada visualização é registrada na auditoria (quem, cliente e login, nunca o valor) e some da tela em 60 s.</p>
        {erroSenhas && <p role="alert" className="mt-2 text-sm text-red-800">{erroSenhas}</p>}
        {cred && (
          <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-lg bg-tema-contraste/[0.04] p-3 text-sm sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
            {linhasSenha.map(([k, v]) => <div key={k}><dt className="text-xs text-tema-apagado">{k}</dt><dd className={cn('break-all font-mono', v ? 'text-tema-tinta' : 'text-tema-apagado')}>{v ?? NAO_DISPONIVEL}</dd></div>)}
          </dl>
        )}
      </section>

      {dados.grupos.map(g => (
        <details key={g.id} open={g.id === 'cliente' || g.id === 'login'} className="rounded-xl border border-tema-linha">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-tema-tinta">{g.titulo} <span className="font-normal text-tema-apagado">· {g.campos.length} campo(s)</span></summary>
          <dl className="grid gap-x-6 gap-y-3 border-t border-tema-linha p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {g.campos.map(c => <div key={c.campo}><dt className="text-xs text-tema-apagado" title={c.campo}>{c.rotulo}</dt><dd className="break-words font-medium text-tema-tinta">{c.valor}</dd></div>)}
          </dl>
        </details>
      ))}
      <p className="text-[11px] text-tema-apagado">Dados lidos do IXC em {new Date(dados.consultadoEm).toLocaleString('pt-BR')}. {dados.camposProtegidos} campo(s) com senha, documento ou comando foram deixados de fora de propósito. Campos vazios ou zerados no IXC não aparecem.</p>
    </div>
  )
}
