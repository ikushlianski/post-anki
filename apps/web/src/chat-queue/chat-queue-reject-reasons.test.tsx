// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS } from '@post-anki/shared'

import { ChatQueueRejectReasons } from './chat-queue-reject-reasons'

const reason = KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS[0]!

describe('ChatQueueRejectReasons', () => {
  afterEach(cleanup)

  it('should keep Send disabled until a reason is picked, then send the reason with the note', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)

    render(<ChatQueueRejectReasons onSend={onSend} onSkip={vi.fn()} />)

    const send = screen.getByTestId('chat-queue-reason-send') as HTMLButtonElement

    expect(send.disabled).toBe(true)

    fireEvent.click(screen.getByTestId(`chat-queue-reason-${reason}`))
    fireEvent.change(screen.getByLabelText('Optional note about this decision'), { target: { value: 'too vague' } })
    fireEvent.click(send)

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(reason, 'too vague'))
    await waitFor(() => expect(send.disabled).toBe(false))
  })

  it('should disable both buttons while sending and let the learner skip', async () => {
    let finish: () => void = () => {}
    const onSend = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const onSkip = vi.fn()

    render(<ChatQueueRejectReasons onSend={onSend} onSkip={onSkip} />)
    fireEvent.click(screen.getByTestId(`chat-queue-reason-${reason}`))
    fireEvent.click(screen.getByTestId('chat-queue-reason-send'))

    await waitFor(() =>
      expect((screen.getByTestId('chat-queue-reason-skip') as HTMLButtonElement).disabled).toBe(true),
    )
    finish()
    await waitFor(() =>
      expect((screen.getByTestId('chat-queue-reason-skip') as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(screen.getByTestId('chat-queue-reason-skip'))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('should show only the reasons for the card subject type', () => {
    render(
      <ChatQueueRejectReasons
        reasonCodes={['front_unclear_target_phrase', 'other']}
        onSend={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    expect(screen.getByTestId('chat-queue-reason-front_unclear_target_phrase')).toBeTruthy()
    expect(screen.queryByTestId('chat-queue-reason-text_recall_only')).toBeNull()
  })
})
