// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

import { ChatQueueOldestWait, oldestWaitingDays } from './chat-queue-oldest-wait'

const NOW = new Date('2026-10-28T12:00:00.000Z')

function item(id: string, chatAt: string, snoozedUntil: string | null = null): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: 'extracted',
    subjectName: null,
    chatAt,
    turnsLeft: 8,
    snoozedUntil,
  }
}

describe('ChatQueueOldestWait', () => {
  afterEach(cleanup)

  it('should tell the user how long the oldest unsnoozed card has waited', () => {
    render(
      <ChatQueueOldestWait
        items={[item('a', '2026-10-16T12:00:00.000Z'), item('b', '2026-10-26T12:00:00.000Z')]}
        now={NOW}
      />,
    )

    expect(screen.getByTestId('chat-queue-oldest-wait').textContent).toBe(
      'Oldest card has waited 12 days',
    )
  })

  it('should use the singular for a card that has waited one day', () => {
    render(<ChatQueueOldestWait items={[item('a', '2026-10-27T12:00:00.000Z')]} now={NOW} />)

    expect(screen.getByTestId('chat-queue-oldest-wait').textContent).toBe(
      'Oldest card has waited 1 day',
    )
  })

  it('should ignore snoozed cards when finding the oldest wait', () => {
    render(
      <ChatQueueOldestWait
        items={[
          item('a', '2026-09-01T12:00:00.000Z', '2026-11-04T10:00:00.000Z'),
          item('b', '2026-10-23T12:00:00.000Z'),
        ]}
        now={NOW}
      />,
    )

    expect(screen.getByTestId('chat-queue-oldest-wait').textContent).toBe(
      'Oldest card has waited 5 days',
    )
  })

  it('should count a card with an expired snooze as waiting', () => {
    render(
      <ChatQueueOldestWait
        items={[item('a', '2026-10-16T12:00:00.000Z', '2026-10-20T10:00:00.000Z')]}
        now={NOW}
      />,
    )

    expect(screen.getByTestId('chat-queue-oldest-wait').textContent).toBe(
      'Oldest card has waited 12 days',
    )
  })

  it('should stay hidden when every card arrived today', () => {
    render(<ChatQueueOldestWait items={[item('a', '2026-10-28T08:00:00.000Z')]} now={NOW} />)

    expect(screen.queryByTestId('chat-queue-oldest-wait')).toBeNull()
  })

  it('should stay hidden when the queue is empty', () => {
    render(<ChatQueueOldestWait items={[]} now={NOW} />)

    expect(screen.queryByTestId('chat-queue-oldest-wait')).toBeNull()
  })

  it('should stay hidden when only snoozed cards are left', () => {
    render(
      <ChatQueueOldestWait
        items={[item('a', '2026-09-01T12:00:00.000Z', '2026-11-04T10:00:00.000Z')]}
        now={NOW}
      />,
    )

    expect(screen.queryByTestId('chat-queue-oldest-wait')).toBeNull()
  })
})

describe('oldestWaitingDays', () => {
  it('should return zero for an empty queue', () => {
    expect(oldestWaitingDays([], NOW)).toBe(0)
  })
})
