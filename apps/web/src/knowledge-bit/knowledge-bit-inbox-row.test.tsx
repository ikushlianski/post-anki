// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import { KnowledgeBitInboxRow } from './knowledge-bit-inbox-row'
import { PRIMARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

vi.mock('./knowledge-bit-chat-panel', () => ({ KnowledgeBitChatPanel: () => null }))

const item: InboxKnowledgeBit = {
  id: 'b1',
  body: 'Fact b1',
  background: null,
  exampleAiGeneratedAt: null,
  origin: 'extracted',
  subjectName: null,
  cardCount: 2,
  inboxAt: '2026-10-28T10:00:00.000Z',
  note: null,
}

describe('KnowledgeBitInboxRow', () => {
  afterEach(cleanup)

  it('should make Back to triage the only primary button and leave the other actions secondary', () => {
    render(
      <KnowledgeBitInboxRow
        item={item}
        busy={false}
        error={null}
        onBackToTriage={vi.fn()}
        onSendToChat={vi.fn()}
        onDiscard={vi.fn()}
        onChange={vi.fn()}
      />,
    )

    const buttons = screen.getAllByRole('button')
    const primary = buttons.filter((button) => button.className === PRIMARY_BUTTON_CLASS)

    expect(primary.map((button) => button.textContent)).toEqual(['Back to triage'])
    expect(screen.getByTestId('knowledge-bit-inbox-discard-b1-button').className).not.toBe(PRIMARY_BUTTON_CLASS)
  })
})
