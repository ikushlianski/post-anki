import type { CoverageReport, RetentionSummary, TimeToMasterySummary } from '@post-anki/shared'

export function formatTimeToMastery(summary: TimeToMasterySummary | null): string {
  if (!summary || summary.count === 0) {
    return 'No data yet'
  }

  return `${summary.avgHours.toFixed(1)}h avg · ${summary.count} mastered`
}

export function formatRetention(summary: RetentionSummary | null): string {
  if (!summary || summary.count === 0) {
    return 'No data yet'
  }

  return `${Math.round(summary.avgRate * 100)}% avg · ${summary.count} gaps`
}

export function averageCoveragePercent(coverage: CoverageReport): number | null {
  if (coverage.length === 0) {
    return null
  }

  const total = coverage.reduce((sum, area) => sum + area.percent, 0)

  return Math.round(total / coverage.length)
}
