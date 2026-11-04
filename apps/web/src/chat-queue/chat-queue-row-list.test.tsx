// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

import { ChatQueueRowList } from './chat-queue-row-list'

const bit: ChatQueueKnowledgeBit = {
  id: 'a',
  body: 'Fact a',
  background: null,
  origin: 'extracted',
  subjectName: null,
  chatAt: '2026-10-28T10:00:00.000Z',
  turnsLeft: 8,
  snoozedUntil: null,
}

function renderList(items: ChatQueueKnowledgeBit[]) {
  return render(
    <ChatQueueRowList
      items={items}
      focusedId={null}
      picked={new Set()}
      moving={false}
      onToggle={vi.fn()}
      onOpen={vi.fn()}
      onSnoozeChanged={vi.fn()}
    />,
  )
}

afterEach(cleanup)

describe('ChatQueueRowList', () => {
  it('should mark a review chat with a From review badge and no selection or snooze', () => {
    renderList([{ ...bit, reviewChat: true }])

    expect(screen.getByText('From review')).toBeTruthy()
    expect(screen.queryByTestId('chat-queue-select-a')).toBeNull()
    expect(screen.queryByTestId('chat-queue-snooze-a')).toBeNull()
  })

  it('should keep the checkbox and snooze for a triage chat', () => {
    renderList([bit])

    expect(screen.queryByText('From review')).toBeNull()
    expect(screen.getByTestId('chat-queue-select-a')).toBeTruthy()
    expect(screen.getByTestId('chat-queue-snooze-a')).toBeTruthy()
  })
})
