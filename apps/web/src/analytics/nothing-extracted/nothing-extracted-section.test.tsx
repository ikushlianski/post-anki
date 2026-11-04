// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('../analytics.api', () => ({ getNothingExtractedStatistics: vi.fn() }))

import { getNothingExtractedStatistics } from '../analytics.api'
import { NothingExtractedSection } from './nothing-extracted-section'

beforeEach(() => {
  vi.mocked(getNothingExtractedStatistics).mockReset()
})

afterEach(cleanup)

describe('NothingExtractedSection', () => {
  it('should say no notes were processed when every week is empty', async () => {
    vi.mocked(getNothingExtractedStatistics).mockResolvedValue({
      weekly: [{ weekStart: '2026-10-26', processed: 0, nothingExtracted: 0, rate: 0 }],
    })

    render(<NothingExtractedSection />)

    await waitFor(() =>
      expect(screen.getByTestId('nothing-extracted-empty').textContent).toBe('No notes processed in the last 12 weeks'),
    )
  })

  it('should announce the failure and the loading state to screen readers', async () => {
    vi.mocked(getNothingExtractedStatistics).mockRejectedValue(new Error('x'))

    render(<NothingExtractedSection />)

    expect(screen.getByText('Loading...').getAttribute('role')).toBe('status')
    await waitFor(() => expect(screen.getByTestId('nothing-extracted-error').getAttribute('role')).toBe('alert'))
  })

  it('should show the latest rate and a text alternative describing every week', async () => {
    vi.mocked(getNothingExtractedStatistics).mockResolvedValue({
      weekly: [
        { weekStart: '2026-10-19', processed: 0, nothingExtracted: 0, rate: 0 },
        { weekStart: '2026-10-26', processed: 4, nothingExtracted: 1, rate: 0.25 },
      ],
    })

    render(<NothingExtractedSection />)

    await waitFor(() => expect(screen.getByTestId('nothing-extracted-label').textContent).toContain('25%'))
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('1 of 4 notes gave no cards (25%)')
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('no notes processed')
  })
})
