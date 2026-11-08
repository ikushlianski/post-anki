// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

vi.mock('./chat-queue.api', () => ({
  getChatQueue: vi.fn(),
  getChatQueueThread: vi.fn(),
  sendChatQueueMessage: vi.fn(),
  returnFromChatQueue: vi.fn(),
  approveFromChatQueue: vi.fn(),
  rejectFromChatQueue: vi.fn(),
  saveChatQueueRejectReason: vi.fn(),
  acceptChatQueueProposal: vi.fn(),
  rejectChatQueueProposal: vi.fn(),
  snoozeChatQueueCard: vi.fn(),
  unsnoozeChatQueueCard: vi.fn(),
  exportChatQueueMarkdown: vi.fn(),
  searchChatQueue: vi.fn(),
}))

import {
  acceptChatQueueProposal,
  approveFromChatQueue,
  exportChatQueueMarkdown,
  getChatQueue,
  getChatQueueThread,
  rejectChatQueueProposal,
  rejectFromChatQueue,
  returnFromChatQueue,
  saveChatQueueRejectReason,
  sendChatQueueMessage,
  snoozeChatQueueCard,
  unsnoozeChatQueueCard,
} from './chat-queue.api'
import { ChatQueueScreen } from './chat-queue-screen'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'

function item(id: string, turnsLeft = 8): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: 'extracted',
    subjectName: null,
    chatAt: '2026-10-28T10:00:00.000Z',
    turnsLeft,
    snoozedUntil: null,
  }
}

function ok<T>(data: T) {
  return { ok: true as const, data }
}

function fail(failure: 'cap_reached' | 'budget_paused' | 'model_failed' | 'offline') {
  return { ok: false as const, failure }
}

function withProposal(status: 'pending' | 'accepted' | 'rejected') {
  return ok({
    messages: [
      { seq: 1, role: 'user' as const, text: 'Why?', createdAt: '2026-10-28T10:00:00.000Z' },
      {
        seq: 2,
        role: 'assistant' as const,
        text: 'Because of X',
        createdAt: '2026-10-28T10:00:01.000Z',
        proposals: [{ index: 0, kind: 'create' as const, front: 'What is X?', back: 'X is Y.', status }],
      },
    ],
    turnsLeft: 7,
    capReached: false,
  })
}

async function openThread(id = 'a') {
  render(<ChatQueueScreen />)
  await userEvent.click(await screen.findByTestId(`chat-queue-row-${id}`))
  await screen.findByTestId('chat-queue-thread')
}

beforeEach(() => {
  vi.mocked(getChatQueue).mockResolvedValue(ok({ items: [item('a'), item('b', 0)], count: 2 }))
  vi.mocked(getChatQueueThread).mockResolvedValue(
    ok({ messages: [], turnsLeft: 8, capReached: false }),
  )
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.resetAllMocks()
})

describe('ChatQueueScreen', () => {
  it('should list parked cards with the questions left on each', async () => {
    render(<ChatQueueScreen />)

    expect((await screen.findByTestId('chat-queue-row-a')).textContent).toContain('8 left')
    expect(screen.getByTestId('chat-queue-row-b').textContent).toContain('Limit reached')
  })

  it('should snooze a card for the chosen days and show when it wakes up', async () => {
    vi.mocked(snoozeChatQueueCard).mockResolvedValue(
      ok({ ok: true as const, snoozedUntil: '2099-11-04T10:00:00.000Z' }),
    )
    render(<ChatQueueScreen />)

    await userEvent.selectOptions(await screen.findByTestId('chat-queue-snooze-a'), '7')

    expect(snoozeChatQueueCard).toHaveBeenCalledWith({ data: { bitId: 'a', days: 7 } })
    expect((await screen.findByTestId('chat-queue-snoozed-a')).textContent).toContain('Snoozed until')
    expect(screen.getByTestId('chat-queue-row-a')).not.toBeNull()
  })

  it('should refresh the sidebar Chat badge after a snooze and after an unsnooze', async () => {
    const changed = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
    vi.mocked(snoozeChatQueueCard).mockResolvedValue(
      ok({ ok: true as const, snoozedUntil: '2099-11-04T10:00:00.000Z' }),
    )
    vi.mocked(unsnoozeChatQueueCard).mockResolvedValue(ok({ ok: true as const, snoozedUntil: null }))
    render(<ChatQueueScreen />)

    await userEvent.selectOptions(await screen.findByTestId('chat-queue-snooze-a'), '3')
    await userEvent.click(await screen.findByTestId('chat-queue-unsnooze-a'))

    expect(changed).toHaveBeenCalledTimes(2)
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed)
  })

  it('should bring a snoozed card back into the reminder count when unsnoozed', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({
        items: [{ ...item('a'), snoozedUntil: '2099-11-04T10:00:00.000Z' }],
        count: 0,
      }),
    )
    vi.mocked(unsnoozeChatQueueCard).mockResolvedValue(ok({ ok: true as const, snoozedUntil: null }))
    render(<ChatQueueScreen />)

    await userEvent.click(await screen.findByTestId('chat-queue-unsnooze-a'))

    expect(unsnoozeChatQueueCard).toHaveBeenCalledWith({ data: { bitId: 'a' } })
    expect(await screen.findByTestId('chat-queue-snooze-a')).not.toBeNull()
  })

  it('should say how many cards exist when only the first part of the list is shown', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({ items: [item('a'), item('b', 0)], count: 2, total: 250, hasMore: true }),
    )
    render(<ChatQueueScreen />)

    const notice = await screen.findByTestId('chat-queue-truncated')

    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.textContent).toBe('Showing the first 2 of 250 cards')
  })

  it('should not show a truncation notice when the whole queue is listed', async () => {
    render(<ChatQueueScreen />)

    await screen.findByTestId('chat-queue-row-a')

    expect(screen.queryByTestId('chat-queue-truncated')).toBeNull()
  })

  it('should explain an empty Chat queue', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(ok({ items: [], count: 0 }))
    render(<ChatQueueScreen />)

    expect(await screen.findByTestId('chat-queue-empty')).not.toBeNull()
  })

  it('should offer a retry when the queue cannot load', async () => {
    vi.mocked(getChatQueue).mockResolvedValueOnce(fail('offline'))
    render(<ChatQueueScreen />)

    expect((await screen.findByTestId('chat-queue-load-error')).textContent).toContain('offline')
  })

  it('should show starter prompts that send a plain-text question', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue(
      ok({ reply: '<b>Because</b>', replySeq: 2, turnsLeft: 7, capReached: false }),
    )
    await openThread()

    await userEvent.click(screen.getByText('Why is this card worth keeping?'))

    expect(await screen.findByText('<b>Because</b>')).not.toBeNull()
    expect(screen.getByTestId('chat-queue-turns-left').getAttribute('aria-label')).toBe('7 of 8 turns left')
    expect(screen.queryByTestId('chat-queue-starters')).toBeNull()
  })

  it('should keep the draft and say no question was used when the model fails', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue(fail('model_failed'))
    await openThread()

    await userEvent.type(screen.getByLabelText('Ask about this card'), 'Hello')
    await userEvent.click(screen.getByTestId('chat-queue-send'))

    expect((await screen.findByTestId('chat-queue-error')).textContent).toContain('no question was used')
    expect((screen.getByLabelText('Ask about this card') as HTMLTextAreaElement).value).toBe('Hello')
  })

  it('should stop asking and say to decide when the cap is reached', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue(fail('cap_reached'))
    await openThread()

    await userEvent.type(screen.getByLabelText('Ask about this card'), 'Hello')
    await userEvent.click(screen.getByTestId('chat-queue-send'))

    expect(await screen.findByTestId('chat-queue-limit')).not.toBeNull()
    expect((screen.getByTestId('chat-queue-accept') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should pause chat for the day when the budget is used up', async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue(fail('budget_paused'))
    await openThread()

    await userEvent.type(screen.getByLabelText('Ask about this card'), 'Hello')
    await userEvent.click(screen.getByTestId('chat-queue-send'))

    expect(await screen.findByTestId('chat-queue-paused')).not.toBeNull()
  })

  it('should remove the card from the queue when accepted', async () => {
    vi.mocked(approveFromChatQueue).mockResolvedValue(ok({ ok: true }))
    await openThread()

    await userEvent.click(screen.getByTestId('chat-queue-accept'))

    await waitFor(() => expect(screen.queryByTestId('chat-queue-row-a')).toBeNull())
    expect(screen.getByTestId('chat-queue-row-b')).not.toBeNull()
  })

  it('should send the card back to triage', async () => {
    vi.mocked(returnFromChatQueue).mockResolvedValue(ok({ ok: true }))
    await openThread()

    await userEvent.click(screen.getByTestId('chat-queue-back'))

    await waitFor(() => expect(screen.queryByTestId('chat-queue-row-a')).toBeNull())
  })

  it('should save the chosen reject reason from the selectable list', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue(ok({ ok: true, feedbackId: 'f1' }))
    vi.mocked(saveChatQueueRejectReason).mockResolvedValue(ok({ ok: true }))
    await openThread()

    await userEvent.click(screen.getByTestId('chat-queue-reject'))
    expect(screen.queryByTestId('chat-queue-reason-bad_format')).toBeNull()
    await userEvent.click(await screen.findByTestId('chat-queue-reason-text_recall_only'))
    await userEvent.click(screen.getByTestId('chat-queue-reason-send'))

    await waitFor(() => expect(screen.queryByTestId('chat-queue-row-a')).toBeNull())
    expect(saveChatQueueRejectReason).toHaveBeenCalledWith({
      data: { feedbackId: 'f1', reasonCode: 'text_recall_only' },
    })
  })

  it('should let the user skip the reject reason', async () => {
    vi.mocked(rejectFromChatQueue).mockResolvedValue(ok({ ok: true, feedbackId: 'f1' }))
    await openThread()

    await userEvent.click(screen.getByTestId('chat-queue-reject'))
    await userEvent.click(await screen.findByTestId('chat-queue-reason-skip'))

    await waitFor(() => expect(screen.queryByTestId('chat-queue-row-a')).toBeNull())
    expect(saveChatQueueRejectReason).not.toHaveBeenCalled()
  })

  it('should reload a pending proposal and save it only after the learner accepts', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(withProposal('pending'))
    vi.mocked(acceptChatQueueProposal).mockResolvedValue(ok({ ok: true, status: 'accepted', savedCardId: 'kb_new' }))
    await openThread()

    expect(await screen.findByText('What is X?')).not.toBeNull()
    expect(acceptChatQueueProposal).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('chat-queue-proposal-accept-0'))

    expect(acceptChatQueueProposal).toHaveBeenCalledTimes(1)
    expect(acceptChatQueueProposal).toHaveBeenCalledWith({ data: { bitId: 'a', seq: 2, index: 0 } })
    expect(await screen.findByTestId('chat-queue-proposal-accepted-0')).not.toBeNull()
    expect(screen.queryByTestId('chat-queue-proposal-accept-0')).toBeNull()
  })

  it('should keep the thread open after a rejected proposal and ask what is wrong', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(withProposal('pending'))
    vi.mocked(rejectChatQueueProposal).mockResolvedValue(ok({ ok: true, status: 'rejected' }))
    vi.mocked(sendChatQueueMessage).mockResolvedValue(
      ok({ reply: 'Revised', replySeq: 4, turnsLeft: 6, capReached: false }),
    )
    await openThread()

    await userEvent.click(await screen.findByTestId('chat-queue-proposal-reject-0'))

    expect(rejectChatQueueProposal).toHaveBeenCalledWith({ data: { bitId: 'a', seq: 2, index: 0 } })
    expect(await screen.findByTestId('chat-queue-reject-hint')).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Ask about this card')))

    await userEvent.type(screen.getByLabelText('Ask about this card'), 'Too vague')
    await userEvent.click(screen.getByTestId('chat-queue-send'))

    expect(await screen.findByText('Revised')).not.toBeNull()
    expect(screen.getByTestId('chat-queue-proposal-rejected-0')).not.toBeNull()
  })

  it('should show a plain message and allow another try when deciding a proposal fails', async () => {
    vi.mocked(getChatQueueThread).mockResolvedValue(withProposal('pending'))
    vi.mocked(acceptChatQueueProposal).mockResolvedValue(fail('offline'))
    await openThread()

    await userEvent.click(await screen.findByTestId('chat-queue-proposal-accept-0'))

    expect((await screen.findByTestId('chat-queue-proposal-error-0')).textContent).toContain('offline')
    expect((screen.getByTestId('chat-queue-proposal-accept-0') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should filter cards by search and subject and let the user clear the filters', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({
        items: [
          { ...item('a'), body: 'Paris is in France', subjectName: 'Geography' },
          { ...item('b'), body: 'ATP is energy', subjectName: 'Biology' },
        ],
        count: 2,
      }),
    )
    render(<ChatQueueScreen />)
    await screen.findByTestId('chat-queue-row-a')
    expect(screen.getByTestId('chat-queue-count').textContent).toBe('2 of 2')

    await userEvent.type(screen.getByTestId('chat-queue-search'), 'PARIS')
    expect(screen.getByTestId('chat-queue-count').textContent).toBe('1 of 2')
    expect(screen.queryByTestId('chat-queue-row-b')).toBeNull()

    await userEvent.selectOptions(screen.getByTestId('chat-queue-subject'), 'Biology')
    expect(await screen.findByTestId('chat-queue-no-matches')).toBeTruthy()

    await userEvent.click(screen.getByTestId('chat-queue-clear-filters'))
    expect(screen.getByTestId('chat-queue-count').textContent).toBe('2 of 2')
    expect(screen.getByTestId('chat-queue-row-b')).toBeTruthy()
  })

  describe('Markdown export', () => {
    function withSubjects() {
      vi.mocked(getChatQueue).mockResolvedValue(
        ok({
          items: [
            { ...item('a'), subjectId: 'subj_geo', subjectName: 'Geography' },
            { ...item('b'), subjectId: 'subj_bio', subjectName: 'Biology' },
          ],
          count: 2,
        }),
      )
    }

    it('should only allow exporting once a subject is picked and download that subject file', async () => {
      withSubjects()
      const createObjectURL = vi.fn(() => 'blob:chat')
      const revokeObjectURL = vi.fn()

      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
      vi.mocked(exportChatQueueMarkdown).mockResolvedValue(
        ok({ filename: 'chat-biology.md', markdown: '# Chat' }),
      )
      render(<ChatQueueScreen />)
      await screen.findByTestId('chat-queue-row-a')

      const button = screen.getByTestId('chat-queue-export') as HTMLButtonElement

      expect(button.disabled).toBe(true)

      await userEvent.selectOptions(screen.getByTestId('chat-queue-subject'), 'Biology')
      expect(button.disabled).toBe(false)

      await userEvent.click(button)

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))
      expect(exportChatQueueMarkdown).toHaveBeenCalledWith({ data: { subjectId: 'subj_bio' } })
      expect(screen.queryByTestId('chat-queue-export-error')).toBeNull()
    })

    it('should tell the user when the export fails', async () => {
      withSubjects()
      vi.mocked(exportChatQueueMarkdown).mockResolvedValue(fail('offline'))
      render(<ChatQueueScreen />)
      await screen.findByTestId('chat-queue-row-a')
      await userEvent.selectOptions(screen.getByTestId('chat-queue-subject'), 'Geography')
      await userEvent.click(screen.getByTestId('chat-queue-export'))

      expect((await screen.findByTestId('chat-queue-export-error')).textContent).toContain('offline')
    })
  })

  it('should snooze from inside the thread, return to the list and show the wake-up date', async () => {
    vi.mocked(snoozeChatQueueCard).mockResolvedValue(
      ok({ ok: true as const, snoozedUntil: '2099-11-04T10:00:00.000Z' }),
    )
    await openThread()

    await userEvent.selectOptions(screen.getByTestId('chat-queue-snooze-a'), '7')

    expect(snoozeChatQueueCard).toHaveBeenCalledWith({ data: { bitId: 'a', days: 7 } })
    expect(await screen.findByTestId('chat-queue-row-a')).not.toBeNull()
    expect(screen.queryByTestId('chat-queue-thread')).toBeNull()
    expect(screen.getByTestId('chat-queue-snoozed-a').textContent).toContain('Snoozed until')
  })

  it('should tell the user a snoozed card is snoozed when opening its thread and let them unsnooze it', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({ items: [{ ...item('a'), snoozedUntil: '2099-11-04T10:00:00.000Z' }], count: 0 }),
    )
    vi.mocked(unsnoozeChatQueueCard).mockResolvedValue(ok({ ok: true as const, snoozedUntil: null }))
    await openThread()

    expect(screen.getByTestId('chat-queue-snoozed-a').textContent).toContain('Snoozed until')

    await userEvent.click(screen.getByTestId('chat-queue-unsnooze-a'))

    expect(unsnoozeChatQueueCard).toHaveBeenCalledWith({ data: { bitId: 'a' } })
    expect(await screen.findByTestId('chat-queue-snooze-a')).not.toBeNull()
    expect(screen.getByTestId('chat-queue-thread')).not.toBeNull()
  })

  it('should keep the thread open when snoozing fails', async () => {
    vi.mocked(snoozeChatQueueCard).mockResolvedValue(fail('offline'))
    await openThread()

    await userEvent.selectOptions(screen.getByTestId('chat-queue-snooze-a'), '3')

    expect((await screen.findByRole('alert')).textContent).toContain('Could not update')
    expect(screen.getByTestId('chat-queue-thread')).not.toBeNull()
  })
})

describe('ChatQueueScreen keyboard shortcuts', () => {
  it('should not move the list or open a thread with j/k/Enter while the help dialog is open', async () => {
    render(<ChatQueueScreen />)
    await screen.findByTestId('chat-queue-row-a')

    await userEvent.keyboard('?')
    await userEvent.keyboard('jk')

    expect(screen.getByTestId('chat-queue-row-a').getAttribute('aria-current')).toBeNull()

    await userEvent.keyboard('{Enter}')

    expect(screen.queryByTestId('chat-queue-thread')).toBeNull()
    expect(getChatQueueThread).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('j')

    expect(screen.getByTestId('chat-queue-row-a').getAttribute('aria-current')).toBe('true')
  })

  it('should move the highlight with j/k and open the focused card with Enter', async () => {
    render(<ChatQueueScreen />)
    await screen.findByTestId('chat-queue-row-a')

    expect(screen.getByTestId('chat-queue-shortcuts-hint').textContent).toBe('j/k to move, Enter to open')

    await userEvent.keyboard('j')
    expect(screen.getByTestId('chat-queue-row-a').getAttribute('aria-current')).toBe('true')

    await userEvent.keyboard('j')
    expect(screen.getByTestId('chat-queue-row-b').getAttribute('aria-current')).toBe('true')
    expect(screen.getByTestId('chat-queue-row-a').getAttribute('aria-current')).toBeNull()

    await userEvent.keyboard('k')
    expect(screen.getByTestId('chat-queue-row-a').getAttribute('aria-current')).toBe('true')

    await userEvent.keyboard('{Enter}')
    await screen.findByTestId('chat-queue-thread')
    expect(getChatQueueThread).toHaveBeenCalledWith({ data: { bitId: 'a' } })
  })

  it('should ignore j while typing in the search box', async () => {
    render(<ChatQueueScreen />)
    await screen.findByTestId('chat-queue-row-a')

    const search = screen.getByTestId('chat-queue-search')

    await userEvent.click(search)
    await userEvent.keyboard('j')

    expect((search as HTMLInputElement).value).toBe('j')
    expect(document.querySelector('[aria-current="true"]')).toBeNull()
  })

  it('should ignore shortcuts with a modifier key held', async () => {
    render(<ChatQueueScreen />)
    await screen.findByTestId('chat-queue-row-a')

    await userEvent.keyboard('{Control>}j{/Control}')

    expect(screen.getByTestId('chat-queue-row-a').getAttribute('aria-current')).toBeNull()
  })

  it('should list the longest-waiting card first and flip with the toggle', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({
        items: [
          { ...item('new'), chatAt: '2026-10-28T10:00:00.000Z' },
          { ...item('old'), chatAt: '2026-10-20T10:00:00.000Z' },
        ],
        count: 2,
      }),
    )
    render(<ChatQueueScreen now={new Date('2026-10-28T12:00:00.000Z')} />)
    await screen.findByTestId('chat-queue-row-old')
    const ids = () =>
      screen.getAllByTestId(/^chat-queue-row-/).map((el) => el.getAttribute('data-testid'))

    expect(ids()).toEqual(['chat-queue-row-old', 'chat-queue-row-new'])

    await userEvent.click(screen.getByTestId('chat-queue-order'))

    expect(ids()).toEqual(['chat-queue-row-new', 'chat-queue-row-old'])
  })

  it('should open newest first on the next visit after the user chose that order', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({
        items: [
          { ...item('new'), chatAt: '2026-10-28T10:00:00.000Z' },
          { ...item('old'), chatAt: '2026-10-20T10:00:00.000Z' },
        ],
        count: 2,
      }),
    )
    const first = render(<ChatQueueScreen now={new Date('2026-10-28T12:00:00.000Z')} />)
    await screen.findByTestId('chat-queue-row-old')
    await userEvent.click(screen.getByTestId('chat-queue-order'))
    first.unmount()

    render(<ChatQueueScreen now={new Date('2026-10-28T12:00:00.000Z')} />)
    await screen.findByTestId('chat-queue-row-old')

    expect(
      screen.getAllByTestId(/^chat-queue-row-/).map((el) => el.getAttribute('data-testid')),
    ).toEqual(['chat-queue-row-new', 'chat-queue-row-old'])
    expect(screen.getByTestId('chat-queue-order').textContent).toBe('Newest first')
  })

  it('should show how long each card has waited on the row and in the thread header', async () => {
    vi.mocked(getChatQueue).mockResolvedValue(
      ok({
        items: [
          { ...item('a'), chatAt: '2026-10-25T10:00:00.000Z' },
          { ...item('b'), chatAt: '2026-10-28T10:00:00.000Z' },
        ],
        count: 2,
      }),
    )
    render(<ChatQueueScreen now={new Date('2026-10-28T12:00:00.000Z')} />)

    expect((await screen.findByTestId('chat-queue-waiting-a')).textContent).toBe('waiting 3 days')
    expect(screen.getByTestId('chat-queue-waiting-b').textContent).toBe('waiting today')

    await userEvent.click(screen.getByTestId('chat-queue-row-a'))

    expect((await screen.findByTestId('chat-queue-thread-waiting')).textContent).toBe(
      'waiting 3 days',
    )
  })
})
