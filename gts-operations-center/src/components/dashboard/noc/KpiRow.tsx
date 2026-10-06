'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Wifi, WifiOff, ClipboardList, ShieldCheck } from 'lucide-react'
import { NOC } from './theme'
import { SOMBRA_CARD } from './GlassCard'

export async function fetchKpis() {
  const res = await fetch('/api/dashboard/kpis')
  if (!res.ok) throw new Error('Erro ao buscar KPIs')
  return res.json()
}

interface KpiDef {
  key: 'clientesOnline' | 'clientesOffline' | 'chamados' | 'sla'
  label: string
  icon: React.ElementType
  cor: string
  href: string
  dica: string
  formatar?: (v: number) => string
}

// Os rotulos seguem o que cada consulta mede (api/dashboard/kpis):
// - clientes conectados: ONUs com status "Online" no SmartOLT;
// - clientes desconectados: demais ONUs (offline, LOS, queda de energia);
// - chamados em aberto: status ABERTO + EM_ANDAMENTO;
// - SLA: % de chamados do mes corrente resolvidos dentro do prazo.
const KPIS: KpiDef[] = [
  { key: 'clientesOnline', label: 'Clientes conectados', icon: Wifi, cor: NOC.sucesso, href: '/smartolt', dica: 'ONUs online no SmartOLT' },
  { key: 'clientesOffline', label: 'Clientes desconectados', icon: WifiOff, cor: NOC.critico, href: '/smartolt', dica: 'ONUs que não estão online (offline, sem sinal ou sem energia)' },
  { key: 'chamados', label: 'Chamados em aberto', icon: ClipboardList, cor: NOC.laranja, href: '/agenda', dica: 'Chamados abertos e em andamento' },
  { key: 'sla', label: 'SLA de atendimento', icon: ShieldCheck, cor: NOC.sucesso, href: '/reports', dica: 'Chamados do mês atual resolvidos dentro do prazo', formatar: v => `${v}%` },
]

export function KpiRow() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchKpis, refetchInterval: 15000 })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {KPIS.map(kpi => {
        const Icon = kpi.icon
        const valor: number | null | undefined = data?.[kpi.key]?.valor

        let texto = ''
        let secundario = false
        if (isLoading) { texto = '···'; secundario = true }
        else if (isError || !data?.[kpi.key]) { texto = 'Indisponível'; secundario = true }
        else if (valor == null) { texto = 'Sem dados'; secundario = true }
        else texto = kpi.formatar ? kpi.formatar(valor) : valor.toLocaleString('pt-BR')

        return (
          <Link
            key={kpi.key}
            href={kpi.href}
            title={kpi.dica}
            className="flex items-center gap-4 rounded-xl border bg-tema-superficie px-5 py-4 transition-colors hover:border-tema-linha-forte"
            style={{ borderColor: NOC.cinzaEscuro, boxShadow: SOMBRA_CARD }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${kpi.cor}1A` }}>
              <Icon className="w-6 h-6" style={{ color: kpi.cor }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: NOC.texto }}>{kpi.label}</p>
              <p
                className={secundario ? 'text-base font-semibold leading-tight mt-1' : 'font-mono text-[32px] leading-none font-bold mt-1 tracking-tight'}
                style={{ color: secundario ? NOC.textoSecundario : NOC.texto }}
              >
                {texto}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
