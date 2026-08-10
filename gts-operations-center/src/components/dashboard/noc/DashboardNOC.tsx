'use client'

import { NOC } from './theme'
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
import { DashboardFooterBar } from './DashboardFooterBar'

export function DashboardNOC() {
  return (
    <div className="-m-6 min-h-full" style={{ backgroundColor: NOC.bg }}>
      <div className="p-6 space-y-5">
        <DashboardToolbar />

        <KpiRow />

        <OltLinksCard />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2" style={{ minHeight: 420 }}>
            <NetworkMapCard />
          </div>
          <div style={{ minHeight: 420 }}>
            <CriticalAlertsCard />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <BandwidthChartCard />
          <TicketsInProgressCard />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <MikrotikStatusCard />
          <TicketsWeeklyChartCard />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <FieldTechniciansCard />
          <UnifiedTimelineCard />
        </div>

        <div className="rounded-2xl border" style={{ backgroundColor: `${NOC.card}CC`, borderColor: 'rgba(255,255,255,0.05)' }}>
          <DashboardFooterBar />
        </div>
      </div>
    </div>
  )
}
