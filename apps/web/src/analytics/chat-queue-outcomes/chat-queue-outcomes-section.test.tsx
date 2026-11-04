// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('../analytics.api', () => ({ getChatQueueOutcomesStatistics: vi.fn() }))

import { getChatQueueOutcomesStatistics } from '../analytics.api'
import { ChatQueueOutcomesSection } from './chat-queue-outcomes-section'

beforeEach(() => {
  vi.mocked(getChatQueueOutcomesStatistics).mockReset()
})

afterEach(cleanup)

describe('ChatQueueOutcomesSection', () => {
  it('should tell the user no cards were sent to Chat when the queue was never used', async () => {
    vi.mocked(getChatQueueOutcomesStatistics).mockResolvedValue({
      windowDays: 30,
      total: 0,
      accepted: 0,
      rejected: 0,
      waiting: 0,
      snoozed: 0,
    })

    render(<ChatQueueOutcomesSection />)

    await waitFor(() =>
      expect(screen.getByTestId('chat-queue-outcomes-empty').textContent).toBe(
        'No cards were sent to Chat in the last 30 days',
      ),
    )
  })

  it('should show how many Chat cards were accepted, rejected, still waiting or snoozed with their share', async () => {
    vi.mocked(getChatQueueOutcomesStatistics).mockResolvedValue({
      windowDays: 30,
      total: 10,
      accepted: 5,
      rejected: 2,
      waiting: 2,
      snoozed: 1,
    })

    render(<ChatQueueOutcomesSection />)

    await waitFor(() => expect(screen.getByTestId('chat-queue-outcome-accepted')).toBeTruthy())
    expect(screen.getByTestId('chat-queue-outcomes-total').textContent).toContain('10 cards sent to Chat')
    expect(screen.getByTestId('chat-queue-outcome-accepted').textContent).toContain('5 (50%)')
    expect(screen.getByTestId('chat-queue-outcome-waiting').textContent).toContain('Still waiting')
    expect(screen.getByTestId('chat-queue-outcome-snoozed').textContent).toContain('1 (10%)')
  })

  it('should offer a retry when the numbers cannot be loaded', async () => {
    vi.mocked(getChatQueueOutcomesStatistics).mockRejectedValue(new Error('x'))

    render(<ChatQueueOutcomesSection />)

    await waitFor(() => expect(screen.getByTestId('chat-queue-outcomes-error').getAttribute('role')).toBe('alert'))
  })
})
