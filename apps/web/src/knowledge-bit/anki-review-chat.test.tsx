// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ankiReviewKeyAction, useAnkiReviewKeyboard } from './anki-review-keyboard'
import { ANKI_REVIEW_SHORTCUTS } from './anki-review-shortcuts'
import { AnkiReviewCardActions } from './anki-review-card-actions'
import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'

vi.mock('./knowledge-bit-chat.api', () => ({ askKnowledgeBitChat: vi.fn() }))

afterEach(cleanup)

const base = {
  key: 'c',
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  targetIsEditable: false,
}
const screenFacts = { hasCard: true, revealed: false, busy: false, canUndo: false, editing: false }

describe('review chat shortcut', () => {
  it('should open the chat with c even before the answer is revealed', () => {
    expect(ankiReviewKeyAction(base, screenFacts)).toEqual({ type: 'chat' })
  })

  it('should ignore c while the learner is typing in an input', () => {
    expect(ankiReviewKeyAction({ ...base, targetIsEditable: true }, screenFacts)).toBeNull()
  })

  it('should ignore review keys while the chat is open', () => {
    expect(ankiReviewKeyAction({ ...base, key: '3' }, { ...screenFacts, revealed: true, chatOpen: true })).toBeNull()
  })

  it('should list the chat shortcut in the help', () => {
    expect(ANKI_REVIEW_SHORTCUTS.some((s) => s.keys === 'c')).toBe(true)
  })
})

function Harness() {
  const [open, setOpen] = useState(false)
  const [graded, setGraded] = useState(0)

  useAnkiReviewKeyboard({ ...screenFacts, revealed: true, chatOpen: open }, (a) => {
    if (a.type === 'chat') setOpen(true)
    else setGraded((n) => n + 1)
  })

  return (
    <div>
      <AnkiReviewCardActions revealed leech={false} disabled={false} onEdit={vi.fn()} onBury={vi.fn()} onSuspend={vi.fn()} onChat={() => setOpen(true)} />
      <KnowledgeBitChatPanel knowledgeBitId="b1" open={open} onOpenChange={setOpen} />
      <p data-testid="graded">{graded}</p>
    </div>
  )
}

describe('review chat dialog', () => {
  it('should open from the Chat button and close without grading the card', async () => {
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>,
    )
    await user.click(screen.getByTestId('anki-review-chat'))
    expect(screen.getByTestId('knowledge-bit-chat-panel')).toBeTruthy()
    await user.click(screen.getByTestId('knowledge-bit-chat-close'))
    expect(screen.queryByTestId('knowledge-bit-chat-panel')).toBeNull()
    expect(screen.getByTestId('graded').textContent).toBe('0')
  })

  it('should open with the c key and not grade while typing in the chat', async () => {
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>,
    )
    await user.keyboard('c')
    await user.click(screen.getByTestId('knowledge-bit-chat-input'))
    await user.keyboard('123')
    expect(screen.getByTestId('graded').textContent).toBe('0')
  })
})
