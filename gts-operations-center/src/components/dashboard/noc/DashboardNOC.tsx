'use client'

import { DashboardToolbar } from './DashboardToolbar'
import { KpiRow } from './KpiRow'
import { NetworkMapCard } from './NetworkMapCard'
import { CriticalAlertsCard } from './CriticalAlertsCard'
import { BandwidthChartCard } from './BandwidthChartCard'
import { TicketsInProgressCard } from './TicketsInProgressCard'
import { MikrotikStatusCard } from './MikrotikStatusCard'
import { TicketsWeeklyChartCard } from './TicketsWeeklyChartCard'
import { FieldTechniciansCard } from './FieldTechniciansCard'
import { UnifiedTimelineCard } from './UnifiedTimelineCard'
import { OltLinksCard } from './OltLinksCard'
import { IndicadoresComplementares } from './IndicadoresComplementares'
import { DashboardFooterBar } from './DashboardFooterBar'

export function DashboardNOC() {
  return (
    <div className="space-y-4 min-h-full">
      <DashboardToolbar />

      <KpiRow />

      <OltLinksCard />

      {/* Mapa (2/3) e alertas (1/3): a altura da linha vem do mapa. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2" style={{ minHeight: 460 }}>
          <NetworkMapCard />
        </div>
        <div style={{ minHeight: 320 }}>
          <CriticalAlertsCard />
        </div>
      </div>

      <IndicadoresComplementares />

      {/* Demais paineis operacionais (area secundaria) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BandwidthChartCard />
        <TicketsInProgressCard />
        <MikrotikStatusCard />
        <TicketsWeeklyChartCard />
        <FieldTechniciansCard />
        <UnifiedTimelineCard />
      </div>

      <DashboardFooterBar />
    </div>
  )
}
