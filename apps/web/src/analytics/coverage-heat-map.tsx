import type { CoverageReport } from '@post-anki/shared'

import { coverageBand, type CoverageBand } from './coverage-band'
import { buildCoverageGrid } from './coverage-grid'

export interface CoverageHeatMapProps {
  coverage: CoverageReport
}

const BAND_CLASSES: Record<CoverageBand, string> = {
  'no-data':
    'bg-[#e1e0d9] text-[#52514e] border border-dashed border-[#c3c2b7] dark:bg-[#2c2c2a] dark:text-[#c3c2b7] dark:border-[#383835]',
  low: 'bg-[#cde2fb] text-[#0b0b0b] dark:bg-[#0d366b] dark:text-[#ffffff]',
  'mid-low': 'bg-[#86b6ef] text-[#0b0b0b] dark:bg-[#184f95] dark:text-[#ffffff]',
  mid: 'bg-[#3987e5] text-white dark:bg-[#256abf] dark:text-white',
  'mid-high': 'bg-[#256abf] text-white dark:bg-[#3987e5] dark:text-white',
  high: 'bg-[#0d366b] text-white dark:bg-[#86b6ef] dark:text-[#0b0b0b]',
}

const BAND_LABEL: Record<CoverageBand, string> = {
  'no-data': 'No mapped curricula',
  low: '0–19% mastered',
  'mid-low': '20–39% mastered',
  mid: '40–59% mastered',
  'mid-high': '60–79% mastered',
  high: '80–100% mastered',
}

export function CoverageHeatMap({ coverage }: CoverageHeatMapProps) {
  if (coverage.length === 0) {
    return (
      <p data-testid="coverage-heat-map-empty" className="text-sm text-neutral-500">
        No Areas defined for this domain yet.
      </p>
    )
  }

  const grid = buildCoverageGrid(coverage)

  return (
    <div data-testid="coverage-heat-map">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-2 text-left text-[11px] font-medium text-neutral-400">Subject</th>
              {grid.areaNames.map((areaName) => (
                <th
                  key={areaName}
                  className="px-1 text-left text-[11px] font-medium text-neutral-400"
                >
                  {areaName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.subjectNames.map((subjectName) => (
              <tr key={subjectName}>
                <th className="px-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-200">
                  {subjectName}
                </th>
                {grid.areaNames.map((areaName) => {
                  const cell = grid.cellsBySubjectAndArea[subjectName]?.[areaName]

                  if (!cell) {
                    return <td key={areaName} className="h-12 w-16" />
                  }

                  const band = coverageBand(cell.status, cell.percent)

                  return (
                    <td
                      key={areaName}
                      data-testid="coverage-heat-map-cell"
                      data-band={band}
                      title={`${subjectName} · ${areaName}: ${BAND_LABEL[band]}`}
                      className={`h-12 w-16 rounded-md text-center align-middle text-xs font-medium ${BAND_CLASSES[band]}`}
                    >
                      {cell.status === 'gap' ? '—' : `${cell.percent}%`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CoverageHeatMapLegend />
    </div>
  )
}

function CoverageHeatMapLegend() {
  const bands: CoverageBand[] = ['no-data', 'low', 'mid-low', 'mid', 'mid-high', 'high']

  return (
    <ul
      data-testid="coverage-heat-map-legend"
      className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-500 dark:text-neutral-400"
    >
      {bands.map((band) => (
        <li key={band} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded ${BAND_CLASSES[band]}`} />
          {BAND_LABEL[band]}
        </li>
      ))}
    </ul>
  )
}
