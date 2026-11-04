// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Decide } from './decide'
import { submitDecide } from './decide.server-fns'

vi.mock('./decide.server-fns', () => ({
  listDecideSessions: vi.fn().mockResolvedValue([]),
  resolveDecideBlindSpot: vi.fn(),
  submitDecide: vi.fn(),
}))

afterEach(cleanup)

describe('Decide', () => {
  it('should show an error and keep the typed text when the evaluation request fails', async () => {
    vi.mocked(submitDecide).mockRejectedValueOnce(new Error('network'))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Decide />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('decide-decision-input'), { target: { value: 'Move to sessions?' } })
    fireEvent.change(screen.getByTestId('decide-opinion-input'), { target: { value: 'Yes, simpler revocation' } })
    fireEvent.click(screen.getByTestId('decide-submit-button'))

    expect(await screen.findByTestId('decide-error')).toBeTruthy()
    expect((screen.getByTestId('decide-opinion-input') as HTMLTextAreaElement).value).toBe('Yes, simpler revocation')
    await waitFor(() =>
      expect((screen.getByTestId('decide-submit-button') as HTMLButtonElement).disabled).toBe(false),
    )
  })
})
