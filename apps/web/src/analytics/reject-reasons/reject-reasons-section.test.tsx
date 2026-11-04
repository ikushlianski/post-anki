// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('../analytics.api', () => ({ getRejectReasonsStatistics: vi.fn() }))

import { getRejectReasonsStatistics } from '../analytics.api'
import { RejectReasonsSection } from './reject-reasons-section'

beforeEach(() => {
  vi.mocked(getRejectReasonsStatistics).mockReset()
})

afterEach(cleanup)

describe('RejectReasonsSection', () => {
  it('should tell the user no cards were rejected yet when there is nothing to break down', async () => {
    vi.mocked(getRejectReasonsStatistics).mockResolvedValue({ total: 0, reasons: [] })

    render(<RejectReasonsSection />)

    await waitFor(() => expect(screen.getByTestId('reject-reasons-empty').textContent).toBe('No rejected cards yet'))
  })

  it('should announce the failure and the loading state to screen readers', async () => {
    vi.mocked(getRejectReasonsStatistics).mockRejectedValue(new Error('x'))

    render(<RejectReasonsSection />)

    expect(screen.getByText('Loading...').getAttribute('role')).toBe('status')
    await waitFor(() => expect(screen.getByTestId('reject-reasons-error').getAttribute('role')).toBe('alert'))
  })

  it('should show each reason with its label, count and share including legacy and unspecified reasons', async () => {
    vi.mocked(getRejectReasonsStatistics).mockResolvedValue({
      total: 4,
      reasons: [
        { reasonCode: 'text_recall_only', count: 3, share: 0.75 },
        { reasonCode: 'bad_format', count: 1, share: 0.25 },
      ],
    })

    render(<RejectReasonsSection />)

    await waitFor(() => expect(screen.getByTestId('reject-reason-text_recall_only')).toBeTruthy())
    expect(screen.getByTestId('reject-reason-text_recall_only').textContent).toContain('3 (75%)')
    expect(screen.getByTestId('reject-reason-bad_format').textContent).toContain('Bad format')
  })

  it('should link to the rejected cards page so a reason can be inspected card by card', async () => {
    vi.mocked(getRejectReasonsStatistics).mockResolvedValue({ total: 0, reasons: [] })

    render(<RejectReasonsSection />)

    expect(screen.getByTestId('reject-reasons-browse-link').getAttribute('href')).toBe('/knowledge/rejected')
  })
})
