'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Server, Radio, Truck, Users, DollarSign, CalendarCheck } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { GlassCard } from './GlassCard'
import { NOC } from './theme'
import { fetchKpis } from './KpiRow'
import { fetchOlts } from './OltLinksCard'

async function fetchStats() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) throw new Error('Erro ao buscar estatisticas')
  return res.json()
}

type Estado = 'carregando' | 'indisponivel' | 'ok'

function texto(estado: Estado, valor: string) {
  return estado === 'carregando' ? '···' : estado === 'indisponivel' ? 'Indisponível' : valor
}

function estadoDe(q: { isLoading: boolean; isError: boolean }): Estado {
  return q.isLoading ? 'carregando' : q.isError ? 'indisponivel' : 'ok'
}

function Principal({ icone: Icone, cor, valor, rotulo, detalhe, href, estado }: {
  icone: React.ElementType; cor: string; valor: string; rotulo: string; detalhe?: string; href: string; estado: Estado
}) {
  const ok = estado === 'ok'
  return (
    <Link href={href} className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${cor}14` }}>
        <Icone className="w-5 h-5" style={{ color: cor }} />
      </div>
      <div className="min-w-0">
        <p className={ok ? 'font-mono text-xl font-bold leading-none' : 'text-sm font-semibold'} style={{ color: ok ? NOC.texto : NOC.textoSecundario }}>
          {texto(estado, valor)}
        </p>
        <p className="text-xs mt-1" style={{ color: NOC.textoSecundario }}>
          {rotulo}{ok && detalhe ? ` · ${detalhe}` : ''}
        </p>
      </div>
    </Link>
  )
}

function Secundario({ icone: Icone, valor, rotulo, href, estado }: {
  icone: React.ElementType; valor: string; rotulo: string; href: string; estado: Estado
}) {
  return (
    <Link href={href} className="flex items-center gap-2 text-xs min-w-0" style={{ color: NOC.textoSecundario }}>
      <Icone className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-semibold" style={{ color: NOC.texto }}>{texto(estado, valor)}</span>
      <span className="truncate">{rotulo}</span>
    </Link>
  )
}

// Faixa abaixo do mapa. Rotulos conforme o que cada consulta mede:
// - OLTs conectadas: OLTs que nao estao fora do ar, de /api/smartolt/status;
// - ONUs cadastradas: total de ONUs no SmartOLT (/api/dashboard/kpis);
// - Veiculos ativos: veiculos com cadastro ativo (/api/dashboard/stats). A
//   consulta nao mede conexao/rastreamento, entao nao se diz "online".
export function IndicadoresComplementares() {
  const kpis = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchKpis, refetchInterval: 15000 })
  const olts = useQuery({ queryKey: ['dashboard-olts'], queryFn: fetchOlts, refetchInterval: 30000 })
  const stats = useQuery({ queryKey: ['dashboard-stats'], queryFn: fetchStats, refetchInterval: 30000 })

  const eKpis = estadoDe(kpis)
  const eOlts = estadoDe(olts)
  const eStats = estadoDe(stats)

  // "Conectada" = OLT que nao esta fora do ar (online ou instavel).
  const oltsConectadas = (olts.data ?? []).filter(o => o.status !== 'OFFLINE').length
  const oltsTotal = (olts.data ?? []).length

  return (
    <GlassCard>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Principal
          icone={Server} cor={NOC.azulPrimario} href="/smartolt" estado={eOlts}
          valor={String(oltsConectadas)} rotulo="OLTs conectadas" detalhe={`de ${oltsTotal}`}
        />
        <Principal
          icone={Radio} cor={NOC.azulPrimario} href="/smartolt" estado={eKpis}
          valor={(kpis.data?.onus?.valor ?? 0).toLocaleString('pt-BR')} rotulo="ONUs cadastradas"
        />
        <Principal
          icone={Truck} cor={NOC.sucesso} href="/map" estado={eStats}
          valor={String(stats.data?.veiculosOnline ?? 0)} rotulo="Veículos ativos"
        />
      </div>

      <div className="mt-4 pt-3 border-t grid grid-cols-1 sm:grid-cols-3 gap-2" style={{ borderColor: NOC.cinzaEscuro }}>
        <Secundario
          icone={Users} href="/teams" estado={eKpis}
          valor={String(kpis.data?.tecnicosOnline?.valor ?? 0)} rotulo="equipes em campo"
        />
        <Secundario
          icone={CalendarCheck} href="/agenda" estado={eStats}
          valor={String(stats.data?.instalacaoHoje ?? 0)} rotulo="instalações hoje"
        />
        <Secundario
          icone={DollarSign} href="/sales" estado={eStats}
          valor={formatCurrency(stats.data?.vendasHoje ?? 0)} rotulo="vendas hoje"
        />
      </div>
    </GlassCard>
  )
}
