'use client'

import { AlertTriangle, Info, XOctagon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { limitesRx } from '@/lib/diagnosticoConexao/limites'
import { NAO_DISPONIVEL, type CategoriaEvento, type DiagnosticoConexao, type Hipotese } from '@/lib/diagnosticoConexao/tipos'
import { GraficoOptico } from './GraficoOptico'

// Abas de rede do Diagnostico de Conexao. Tudo vem do IXC (somente leitura): nao ha consulta direta a OLT, ONU ou roteador.
// Cada bloco diz se o dado e' atual, historico, indisponivel ou se houve FALHA de consulta (falha nunca vira "equipamento offline").

const hora = (s: string | null | undefined) => (s ? s.replace(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}).*$/, '$3/$2/$1 $4') : '—')

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return <div><dt className="text-xs text-tema-apagado">{rotulo}</dt><dd className={cn('font-medium', valor ? 'text-tema-tinta' : 'text-tema-apagado')}>{valor || NAO_DISPONIVEL}</dd></div>
}
function Aviso({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'falha' }) {
  return <p role={tom === 'falha' ? 'alert' : undefined} className={cn('rounded-lg border px-3 py-2 text-sm', tom === 'falha' ? 'border-amber-500/40 bg-amber-500/[0.07] text-amber-900' : 'border-tema-linha text-tema-suave')}>{children}</p>
}
const ehFalha = (motivo: string) => /^Falha ao consultar/.test(motivo)
function Titulo({ children }: { children: React.ReactNode }) { return <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tema-suave">{children}</p> }

const SEV: Record<Hipotese['severidade'], { rotulo: string; classe: string; Icone: React.ElementType }> = {
  info: { rotulo: 'Informação', classe: 'bg-sky-500/10 text-sky-800 border-sky-500/30', Icone: Info },
  atencao: { rotulo: 'Atenção', classe: 'bg-amber-500/10 text-amber-900 border-amber-500/40', Icone: AlertTriangle },
  critico: { rotulo: 'Crítico', classe: 'bg-red-500/10 text-red-800 border-red-500/40', Icone: XOctagon },
}
const CONF = { alta: 'Confiança alta', media: 'Confiança média', baixa: 'Confiança baixa' } as const

export function PainelHipoteses({ hipoteses }: { hipoteses: Hipotese[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-tema-apagado">Hipóteses geradas por regras fixas a partir dos dados do IXC (sem IA). Não são conclusões: com dados só do IXC a confiança nunca passa de média, e nada aqui substitui a confirmação na OLT ou em campo.</p>
      {hipoteses.length === 0 && <Aviso>Nenhuma hipótese com os dados disponíveis neste momento.</Aviso>}
      {hipoteses.map(h => {
        const s = SEV[h.severidade]
        return (
          <article key={h.id} className="rounded-xl border border-tema-linha p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold', s.classe)}><s.Icone className="h-3.5 w-3.5" aria-hidden /> {s.rotulo}</span>
              <span className="rounded-md bg-tema-contraste/[0.06] px-2 py-0.5 text-xs font-semibold text-tema-suave">{CONF[h.confianca]}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-tema-tinta">{h.titulo}</h3>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-tema-suave">Evidências</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-tema-texto">{h.evidencias.map((e, i) => <li key={i}>{e.texto}{e.em && <span className="text-tema-apagado"> · {e.em}</span>}</li>)}</ul>
            <p className="mt-3 rounded-lg bg-tema-contraste/[0.04] px-3 py-2 text-sm text-tema-texto"><b>Próximo teste:</b> {h.proximoTeste}</p>
          </article>
        )
      })}
    </div>
  )
}

export function PainelFibra({ diag }: { diag: DiagnosticoConexao }) {
  const { rede, equipamento: eq } = diag
  const pos = rede.posicao
  const hist = rede.historico
  const lim = limitesRx(pos.disponivel ? pos.olt : null, pos.disponivel ? pos.modeloOnu : null)
  return (
    <div className="space-y-6">
      <section aria-label="Posição da ONU na rede">
        <Titulo>Posição na rede (cadastro do IXC)</Titulo>
        {!pos.disponivel ? <Aviso tom={ehFalha(pos.motivo) ? 'falha' : 'neutro'}>{NAO_DISPONIVEL}. {pos.motivo}</Aviso> : (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="OLT" valor={pos.olt?.nome} />
            <Campo rotulo="Fabricante e modelo da OLT" valor={pos.olt ? [pos.olt.fabricante, pos.olt.modelo].filter(Boolean).join(' ') : null} />
            <Campo rotulo="Versão de software da OLT" valor={pos.olt?.firmware} />
            <Campo rotulo="POP" valor={pos.olt?.pop} />
            <Campo rotulo="PON (quadro/slot/porta)" valor={pos.ponId} />
            <Campo rotulo="Slot / placa" valor={pos.slot} />
            <Campo rotulo="Porta PON" valor={pos.pon} />
            <Campo rotulo="Nº da ONU na PON" valor={pos.onuNumero} />
            <Campo rotulo="Modelo da ONU" valor={pos.modeloOnu} />
            <Campo rotulo="Perfil (código no IXC)" valor={pos.perfilId} />
            <Campo rotulo="Autenticação da ONU" valor={pos.autenticacao} />
            <Campo rotulo="VLANs" valor={pos.vlans.length ? pos.vlans.map(v => `${v.rotulo.replace('VLAN ', '').replace('VLAN', 'serviço')}: ${v.valor}`).join(' · ') : null} />
            <Campo rotulo="Caixa FTTH" valor={pos.caixa ? `${pos.caixa.nome ?? `#${pos.caixa.id}`}${pos.caixa.capacidade ? ` (cap. ${pos.caixa.capacidade})` : ''}` : null} />
            <Campo rotulo="Porta na caixa" valor={pos.caixa?.porta} />
            <Campo rotulo="Interface de transmissão (IXC)" valor={pos.interfaceTransmissao ? `#${pos.interfaceTransmissao}` : null} />
            <Campo rotulo="MTU" valor={pos.mtu} />
          </dl>
        )}
        {pos.disponivel && pos.olt && !pos.olt.ativa && <p className="mt-2 text-xs text-amber-800">A OLT está marcada como inativa no IXC.</p>}
      </section>

      <section aria-label="Indicadores ópticos">
        <Titulo>Indicadores ópticos</Titulo>
        {eq.disponivel ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([['RX (recepção)', eq.sinalRxDbm, 'dBm'], ['TX', eq.sinalTxDbm, 'dBm'], ['Temperatura', eq.temperaturaC, '°C'], ['Tensão', eq.voltagemV, 'V']] as const).map(([r, v, u]) => (
                <div key={r} className="rounded-xl border border-tema-linha p-3"><p className="text-xs font-semibold text-tema-suave">{r}</p>
                  <p className={cn('mt-1 tabular-nums', v == null ? 'text-sm font-medium text-tema-apagado' : 'text-xl font-bold text-tema-tinta')}>{v == null ? 'Sem leitura' : `${v.toLocaleString('pt-BR')} ${u}`}</p></div>
              ))}
            </div>
            <p className="mt-2 text-xs text-tema-apagado">Leitura <b>atual</b> = a última que o IXC registrou ({eq.leituraEm ?? 'data não informada'}). “Sem leitura” = valor zerado/vazio no IXC (ONU desligada ou sem sinal), nunca 0 dBm. Fonte: {eq.fonte}. Limites de referência do RX: {lim.atencaoMin} a {lim.atencaoMax} dBm ({lim.origem}).</p>
          </>
        ) : <Aviso tom={ehFalha(eq.motivo) ? 'falha' : 'neutro'}>{NAO_DISPONIVEL}. {eq.motivo}</Aviso>}
      </section>

      <section aria-label="Histórico óptico">
        <Titulo>Histórico de leituras (leitura histórica, registrada pelo IXC)</Titulo>
        {!hist.disponivel ? <Aviso tom={ehFalha(hist.motivo) ? 'falha' : 'neutro'}>{NAO_DISPONIVEL}. {hist.motivo}</Aviso> : (
          <>
            <p className="mb-2 text-sm text-tema-suave">
              {hist.lidas} leitura(s) mais recentes lidas · {hist.leituras.length} com sinal · {hist.semSinal} sem sinal{hist.intervaloHoras ? ` · coleta a cada ~${hist.intervaloHoras.toLocaleString('pt-BR')} h` : ''}.
              {hist.ultimaValida ? ` Última leitura válida: RX ${hist.ultimaValida.rxDbm ?? '—'} dBm em ${hora(hist.ultimaValida.em)}.` : ' Nenhuma leitura com sinal nesse intervalo.'}
            </p>
            {hist.leituras.length >= 2 ? <GraficoOptico leituras={hist.leituras} limiteMin={lim.atencaoMin} limiteMax={lim.atencaoMax} /> : <p className="text-sm text-tema-suave">Poucas leituras com sinal para traçar a tendência.</p>}
            {hist.leituras.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-tema-linha">
                <table className="min-w-full text-xs">
                  <thead className="bg-tema-contraste/[0.04] text-tema-suave"><tr>{['Leitura em', 'RX (dBm)', 'TX (dBm)', 'Temperatura (°C)', 'Tensão (V)'].map(h => <th key={h} scope="col" className="px-3 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{[...hist.leituras].reverse().slice(0, 12).map(l => (
                    <tr key={l.em} className="border-t border-tema-linha tabular-nums"><td className="whitespace-nowrap px-3 py-1.5">{hora(l.em)}</td><td className="px-3 py-1.5">{l.rxDbm ?? '—'}</td><td className="px-3 py-1.5">{l.txDbm ?? '—'}</td><td className="px-3 py-1.5">{l.temperaturaC ?? '—'}</td><td className="px-3 py-1.5">{l.voltagemV ?? '—'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <p className="text-[11px] text-tema-apagado">Estado GPON em tempo real, LOS, Dying Gasp e alarmes da PON exigem consulta direta à OLT (SNMP/SSH), ainda não implementada: <b>recurso não disponível</b>, não “sem alarmes”.</p>
    </div>
  )
}

export function PainelVizinhanca({ diag }: { diag: DiagnosticoConexao }) {
  const viz = diag.rede.vizinhanca
  if (!viz.disponivel) return <Aviso tom={ehFalha(viz.motivo) ? 'falha' : 'neutro'}>{NAO_DISPONIVEL}. {viz.motivo}</Aviso>
  const { caixa, pon } = viz
  return (
    <div className="space-y-6">
      <section aria-label="Mesma caixa">
        <Titulo>Outros clientes da mesma caixa FTTH</Titulo>
        {!caixa ? <Aviso>Caixa FTTH não identificada para este login.</Aviso> : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <Campo rotulo="Outros logins na caixa" valor={String(caixa.total)} />
              <Campo rotulo="Online" valor={String(caixa.online)} />
              <Campo rotulo="Offline" valor={String(caixa.offline)} />
              <Campo rotulo="Estado indefinido no IXC" valor={String(caixa.indefinidos)} />
              <Campo rotulo="Caíram nas últimas horas" valor={String(caixa.caidosRecentes)} />
            </dl>
            <p className="mt-2 text-xs text-tema-apagado">Capacidade da caixa: {caixa.capacidade ?? 'não informada'}. Só contagens: o GTS Center não mostra dados de outros clientes aqui. Poucos vizinhos cadastrados na caixa limitam a conclusão.</p>
          </>
        )}
      </section>
      <section aria-label="Mesma PON">
        <Titulo>ONUs da mesma PON (leituras registradas no IXC)</Titulo>
        {!pon ? <Aviso>PON não identificada para este login.</Aviso> : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <Campo rotulo="PON" valor={pon.ponId} />
              <Campo rotulo="ONUs cadastradas" valor={String(pon.totalOnus)} />
              <Campo rotulo="Com leitura" valor={String(pon.comLeitura)} />
              <Campo rotulo="Sem leitura" valor={String(pon.semLeitura)} />
              <Campo rotulo="RX abaixo da referência" valor={String(pon.rxFraco)} />
              <Campo rotulo="RX mediano da PON" valor={pon.rxMedianoDbm != null ? `${pon.rxMedianoDbm.toLocaleString('pt-BR')} dBm` : null} />
              <Campo rotulo="Última leitura da PON" valor={hora(pon.ultimaLeituraEm)} />
            </dl>
            <p className="mt-2 text-xs text-tema-apagado">“Sem leitura” inclui ONUs desligadas ou de clientes inativos; compare com o total antes de concluir falha coletiva. Alarmes da PON só virão da consulta direta à OLT (ainda não implementada).</p>
          </>
        )}
      </section>
    </div>
  )
}

const CAT_EVENTO: Record<CategoriaEvento, { rotulo: string; classe: string }> = {
  desconexao: { rotulo: 'Desconexão', classe: 'bg-red-500/10 text-red-800 border-red-500/30' },
  bloqueio: { rotulo: 'Bloqueio', classe: 'bg-amber-500/10 text-amber-900 border-amber-500/40' },
  suspensao: { rotulo: 'Suspensão', classe: 'bg-amber-500/10 text-amber-900 border-amber-500/40' },
  liberacao: { rotulo: 'Liberação', classe: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30' },
  velocidade: { rotulo: 'Velocidade', classe: 'bg-sky-500/10 text-sky-800 border-sky-500/30' },
  contrato: { rotulo: 'Contrato', classe: 'bg-tema-contraste/[0.06] text-tema-texto border-tema-linha' },
}

/** Quedas: o que o IXC informa sobre desconexoes (ultima queda, motivo, contador) + eventos do contrato que explicam quedas administrativas. */
export function PainelQuedas({ diag }: { diag: DiagnosticoConexao }) {
  const sa = diag.sessaoAtual
  const ev = diag.rede.eventosContrato
  const sessoes = diag.sessoes
  const cartoes: [string, string, string][] = [
    ['Conexão agora', sa.disponivel ? (sa.online ? 'Conectado' : 'Desconectado') : NAO_DISPONIVEL, sa.disponivel ? (sa.online ? (sa.inicio ? `Desde ${sa.inicio}` : 'Conexão atual') : (sa.inicio ? `Última conexão iniciada em ${sa.inicio}` : 'Sem conexão no momento')) : sa.motivo],
    ['Última desconexão', sa.disponivel && sa.ultimaDesconexao ? sa.ultimaDesconexao : NAO_DISPONIVEL, sa.disponivel ? (sa.motivoUltimaDesconexao ? `Motivo: ${sa.motivoUltimaDesconexao}` : 'O IXC não informa o motivo') : ''],
    ['Desconexões contadas pelo IXC', sa.disponivel && sa.desconexoes != null ? String(sa.desconexoes) : NAO_DISPONIVEL, 'Contador do cadastro do login no IXC (não tem data de cada queda)'],
    ['Desconexões nos eventos do contrato', ev.disponivel ? String(ev.desconexoes) : NAO_DISPONIVEL, ev.disponivel ? `Últimos ${ev.dias} dias: derrubadas feitas pelo sistema ou por atendente` : ev.motivo],
  ]
  return (
    <div className="space-y-6">
      <section aria-label="Resumo de quedas">
        <Titulo>O que o IXC informa sobre quedas</Titulo>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cartoes.map(([r, v, d]) => (
            <div key={r} className="rounded-xl border border-tema-linha p-4"><p className="text-xs font-semibold text-tema-suave">{r}</p>
              <p className={cn('mt-1 tabular-nums', v === NAO_DISPONIVEL ? 'text-sm font-medium text-tema-apagado' : 'text-xl font-bold text-tema-tinta')}>{v}</p>
              {d && <p className="mt-1 text-[11px] leading-snug text-tema-apagado">{d}</p>}</div>
          ))}
        </div>
      </section>

      <section aria-label="Eventos do contrato">
        <Titulo>Eventos do contrato no IXC (desconexões, bloqueios, liberações e velocidade)</Titulo>
        {!ev.disponivel ? <Aviso tom={ehFalha(ev.motivo) ? 'falha' : 'neutro'}>{NAO_DISPONIVEL}. {ev.motivo}</Aviso>
          : ev.eventos.length === 0 ? <Aviso>O IXC não registrou desconexões, bloqueios ou liberações neste contrato nos últimos {ev.dias} dias.</Aviso> : (
            <div className="overflow-x-auto rounded-xl border border-tema-linha">
              <table className="min-w-full text-sm">
                <thead className="bg-tema-contraste/[0.04] text-left text-xs text-tema-suave"><tr>{['Quando', 'Evento', 'Detalhe'].map(h => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{ev.eventos.map(e => (
                  <tr key={e.id} className="border-t border-tema-linha align-top">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{hora(e.em)}</td>
                    <td className="px-3 py-2"><span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold', CAT_EVENTO[e.categoria].classe)}>{e.falha ? 'Falha ao desconectar' : CAT_EVENTO[e.categoria].rotulo}</span><span className="ml-2 text-xs text-tema-apagado">{e.tipo}</span></td>
                    <td className="px-3 py-2 text-tema-texto">{e.detalhe ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        <p className="mt-2 text-xs text-tema-apagado">Aqui aparecem as quedas <b>provocadas</b> (cliente derrubado pelo sistema ou por atendente, bloqueio, liberação, redução de velocidade). Uma queda de rede (fibra, energia, OLT) <b>não</b> aparece neste histórico.</p>
      </section>

      <section aria-label="Log de sessões">
        <Titulo>Log de sessões (cada queda com data, hora e motivo)</Titulo>
        {sessoes.disponivel
          ? <Aviso>O IXC devolveu {sessoes.total} sessão(ões) no período, {sessoes.desconexoes} desconexão(ões). A lista está em Visão geral → Histórico.</Aviso>
          : <Aviso>{NAO_DISPONIVEL}. {sessoes.motivo} <b>O log de conexões que o IXC mostra na tela dele não é entregue pela API</b> (a consulta de sessões volta vazia). Para ter cada queda aqui, peça ao administrador do IXC para liberar ao usuário da API a leitura das conexões do login (permissão do usuário da API), ou autorize o Orbia a registrar as conexões daqui para frente.</Aviso>}
        <p className="mt-2 text-xs text-tema-apagado">Indício indireto de queda: leituras ópticas &ldquo;sem sinal&rdquo; ficam na aba ONU e fibra{diag.rede.historico.disponivel ? ` (${diag.rede.historico.semSinal} sem sinal nas últimas ${diag.rede.historico.lidas} leituras)` : ''}. Sem sinal pode ser ONU desligada, queda de energia ou rompimento: é um indício, não uma conclusão.</p>
      </section>
    </div>
  )
}

export function PainelOrdensServico({ diag }: { diag: DiagnosticoConexao }) {
  const os = diag.rede.ordensServico
  if (!os.disponivel) return <Aviso tom={ehFalha(os.motivo) ? 'falha' : 'neutro'}>{NAO_DISPONIVEL}. {os.motivo}</Aviso>
  if (os.recentes.length === 0) return <Aviso>O IXC não tem ordens de serviço para este login.</Aviso>
  return (
    <div>
      <p className="mb-2 text-sm text-tema-suave">Ordens de serviço do IXC para este login (as {os.total} mais recentes, em ordem cronológica inversa).</p>
      <div className="overflow-x-auto rounded-xl border border-tema-linha">
        <table className="min-w-full text-sm">
          <thead className="bg-tema-contraste/[0.04] text-left text-xs text-tema-suave"><tr>{['OS', 'Aberta em', 'Assunto', 'Situação', 'Fechada em', 'Prioridade'].map(h => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{os.recentes.map(o => (
            <tr key={o.id} className="border-t border-tema-linha">
              <td className="px-3 py-2 tabular-nums">{o.id}</td><td className="whitespace-nowrap px-3 py-2">{hora(o.abertaEm)}</td><td className="px-3 py-2">{o.assunto ?? '—'}</td>
              <td className="px-3 py-2"><span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', o.status?.toUpperCase() === 'A' ? 'bg-amber-500/15 text-amber-900' : 'bg-emerald-500/10 text-emerald-800')}>{o.statusRotulo ?? '—'}</span></td>
              <td className="whitespace-nowrap px-3 py-2">{hora(o.fechadaEm)}</td><td className="px-3 py-2">{o.prioridade ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
