import type { CoverageReport, RetentionReport, WeeklyDigest } from '@post-anki/shared'

import { CoverageHeatMap } from './coverage-heat-map'
import { MasteryBreakdownTable } from './mastery-breakdown-table'
import { WeeklyDigestPanel } from './weekly-digest-panel'

export interface AnalyticsDashboardProps {
  digest: WeeklyDigest
  coverage: CoverageReport
  retention: RetentionReport
}

export function AnalyticsDashboard({ digest, coverage, retention }: AnalyticsDashboardProps) {
  return (
    <div data-testid="analytics-dashboard" className="space-y-10">
      <section>
        <h2 className="mb-3 text-lg font-medium">This week</h2>
        <WeeklyDigestPanel digest={digest} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Coverage heat map</h2>
        <CoverageHeatMap coverage={coverage} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Mastery by Area</h2>
        <MasteryBreakdownTable entries={retention.byArea} />
      </section>
    </div>
  )
}
