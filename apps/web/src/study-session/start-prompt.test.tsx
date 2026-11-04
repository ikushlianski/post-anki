// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { StartPrompt } from './start-prompt'
import { startStudySession } from './study-session.api'

vi.mock('./study-session.api', () => ({ startStudySession: vi.fn() }))

afterEach(cleanup)

describe('StartPrompt', () => {
  it('should show a failure and not continue when starting the session throws', async () => {
    vi.mocked(startStudySession).mockRejectedValue(new Error('boom'))
    const onStarted = vi.fn()

    render(<StartPrompt sessionId="s1" onStarted={onStarted} />)
    fireEvent.click(screen.getByTestId('session-start-button'))

    expect(await screen.findByTestId('session-start-failed')).toBeTruthy()
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('should continue once the session has started', async () => {
    vi.mocked(startStudySession).mockResolvedValue({ ok: true } as never)
    const onStarted = vi.fn()

    render(<StartPrompt sessionId="s1" onStarted={onStarted} />)
    fireEvent.click(screen.getByTestId('session-start-button'))

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledOnce())
  })
})
