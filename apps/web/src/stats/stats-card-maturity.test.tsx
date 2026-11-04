import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../knowledge-bit/knowledge-browser.api', () => ({ listKnowledgeBrowserSubjectCounts: vi.fn() }))

import { listKnowledgeBrowserSubjectCounts } from '../knowledge-bit/knowledge-browser.api'
import { cardMaturityOf, percentOf } from './card-maturity'
import { StatsCardMaturity } from './stats-card-maturity'

afterEach(cleanup)

const counts = [
  { subjectId: 'a', count: 10, newCount: 2, learningCount: 3, matureCount: 5 },
  { subjectId: null, count: 10, newCount: 5, learningCount: 0, matureCount: 5 },
]

describe('card maturity', () => {
  it('should add up every subject, including cards with no subject', () => {
    expect(cardMaturityOf(counts)).toEqual({ total: 20, mature: 10, learning: 3, new: 7 })
  })

  it('should not divide by zero when there are no cards', () => {
    expect(percentOf(0, 0)).toBe(0)
  })
})

describe('StatsCardMaturity', () => {
  it('should show the percentage and count of mature, learning and new cards', async () => {
    vi.mocked(listKnowledgeBrowserSubjectCounts).mockResolvedValue({ ok: true, counts })

    render(<StatsCardMaturity />)

    expect((await screen.findByTestId('maturity-mature')).textContent).toContain('50% · 10')
    expect(screen.getByTestId('maturity-learning').textContent).toContain('15% · 3')
    expect(screen.getByTestId('maturity-new').textContent).toContain('35% · 7')
  })

  it('should say there are no cards yet for an empty library', async () => {
    vi.mocked(listKnowledgeBrowserSubjectCounts).mockResolvedValue({ ok: true, counts: [] })

    render(<StatsCardMaturity />)

    expect(await screen.findByText('No cards yet.')).toBeTruthy()
  })

  it('should show a failure line when the counts cannot be loaded', async () => {
    vi.mocked(listKnowledgeBrowserSubjectCounts).mockRejectedValue(new Error('boom'))

    render(<StatsCardMaturity />)

    expect(await screen.findByTestId('stats-card-maturity-error')).toBeTruthy()
  })
})
