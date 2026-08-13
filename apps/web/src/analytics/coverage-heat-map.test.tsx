// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { CoverageReport } from '@post-anki/shared'

import { CoverageHeatMap } from './coverage-heat-map'

afterEach(cleanup)

describe('CoverageHeatMap', () => {
  it('shows a neutral empty state when no Areas are defined', () => {
    render(<CoverageHeatMap coverage={[]} />)

    expect(screen.getByTestId('coverage-heat-map-empty')).toBeTruthy()
  })

  it('renders one cell per Area, banded by mastery percent', () => {
    const coverage: CoverageReport = [
      { domainNodeId: '1', name: 'Hooks', subjectName: 'React', percent: 80, status: 'progress' },
      { domainNodeId: '2', name: 'Streams', subjectName: 'Node.js', percent: 0, status: 'gap' },
    ]

    render(<CoverageHeatMap coverage={coverage} />)

    const cells = screen.getAllByTestId('coverage-heat-map-cell')

    expect(cells).toHaveLength(2)
  })

  it('renders a gap Area distinctly from a fully mastered Area — never visually identical', () => {
    const coverage: CoverageReport = [
      { domainNodeId: '1', name: 'Hooks', subjectName: 'React', percent: 100, status: 'progress' },
      { domainNodeId: '2', name: 'Routing', subjectName: 'React', percent: 0, status: 'gap' },
    ]

    render(<CoverageHeatMap coverage={coverage} />)

    const cells = screen.getAllByTestId('coverage-heat-map-cell')
    const bands = cells.map((cell) => cell.dataset.band)

    expect(bands).toContain('high')
    expect(bands).toContain('no-data')
    expect(new Set(bands).size).toBe(2)
  })

  it('renders a legend so color is never the only signal', () => {
    render(
      <CoverageHeatMap
        coverage={[{ domainNodeId: '1', name: 'Hooks', subjectName: 'React', percent: 50, status: 'progress' }]}
      />,
    )

    expect(screen.getByTestId('coverage-heat-map-legend')).toBeTruthy()
  })
})
