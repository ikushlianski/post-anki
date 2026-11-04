// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('./chat-usage.api')

import { getChatUsage } from './chat-usage.api'
import { ChatUsagePanel } from './chat-usage-panel'

const usage = {
  day: '2026-10-29',
  calls: 7,
  inputTokens: 1200,
  outputTokens: 300,
  hourlyCap: 60,
  currentHourCount: 4,
  budgetStatus: 'ok' as const,
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('ChatUsagePanel', () => {
  it('should show today\'s numbers and an ok word when chat replies are allowed', async () => {
    vi.mocked(getChatUsage).mockResolvedValue(usage)
    render(<ChatUsagePanel />)

    expect((await screen.findByTestId('chat-usage-messages')).textContent).toBe('7')
    expect(screen.getByTestId('chat-usage-input-tokens').textContent).toBe('1200')
    expect(screen.getByTestId('chat-usage-output-tokens').textContent).toBe('300')
    expect(screen.getByTestId('chat-usage-hourly').textContent).toBe('4 of 60')
    expect(screen.getByTestId('chat-usage-status').textContent).toBe('ok')
  })

  it('should say paused in words when the budget guard blocks chat replies', async () => {
    vi.mocked(getChatUsage).mockResolvedValue({ ...usage, budgetStatus: 'paused' })
    render(<ChatUsagePanel />)

    expect((await screen.findByTestId('chat-usage-status')).textContent).toBe('paused')
  })

  it('should show a loading note first and an error note when usage cannot be loaded', async () => {
    vi.mocked(getChatUsage).mockRejectedValue(new Error('boom'))
    render(<ChatUsagePanel />)

    expect(screen.getByTestId('chat-usage-loading')).toBeTruthy()
    expect(await screen.findByTestId('chat-usage-error')).toBeTruthy()
  })
})
