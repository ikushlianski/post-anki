import type { CoverageArea } from '@post-anki/shared'

export type CoverageBand = 'no-data' | 'low' | 'mid-low' | 'mid' | 'mid-high' | 'high'

export function coverageBand(status: CoverageArea['status'], percent: number): CoverageBand {
  if (status === 'gap') {
    return 'no-data'
  }

  if (percent >= 80) {
    return 'high'
  }

  if (percent >= 60) {
    return 'mid-high'
  }

  if (percent >= 40) {
    return 'mid'
  }

  if (percent >= 20) {
    return 'mid-low'
  }

  return 'low'
}
