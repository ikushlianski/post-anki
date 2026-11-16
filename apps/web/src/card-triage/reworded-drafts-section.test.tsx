// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RewordedDraft } from '@post-anki/shared'

import { decideRewordedDraft, listRewordedDrafts } from './reworded-drafts.api'
import { RewordedDraftsSection } from './reworded-drafts-section'

vi.mock('./reworded-drafts.api', () => ({
  listRewordedDrafts: vi.fn(),
  decideRewordedDraft: vi.fn(),
}))

const mockedList = vi.mocked(listRewordedDrafts)
const mockedDecide = vi.mocked(decideRewordedDraft)

const DRAFT: RewordedDraft = {
  id: 'kbrd_1',
  knowledgeBitId: 'kb_1',
  originalPrompt: 'What does TCP guarantee?',
  answer: 'Ordered delivery',
  prompt: 'Why can TCP data never arrive out of order?',
  angle: 'reason',
  createdAt: '2026-11-01T10:00:00.000Z',
}

describe('RewordedDraftsSection', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedDecide.mockReset()
    mockedList.mockResolvedValue({ ok: true, data: [DRAFT] })
    mockedDecide.mockResolvedValue({ ok: true, data: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('should show the original front next to the reworded front and the answer', async () => {
    render(<RewordedDraftsSection />)

    expect((await screen.findByTestId('reworded-original-kbrd_1')).textContent).toBe(DRAFT.originalPrompt)
    expect(screen.getByTestId('reworded-prompt-kbrd_1').textContent).toBe(DRAFT.prompt)
    expect(screen.getByTestId('reworded-answer-kbrd_1').textContent).toBe(DRAFT.answer)
  })

  it('should render nothing when there are no drafts to approve', async () => {
    mockedList.mockResolvedValue({ ok: true, data: [] })

    const { container } = render(<RewordedDraftsSection />)

    await waitFor(() => expect(mockedList).toHaveBeenCalled())

    expect(container.innerHTML).toBe('')
  })

  it('should send an approval and remove the draft from the list', async () => {
    render(<RewordedDraftsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(screen.queryByTestId('reworded-draft-kbrd_1')).toBeNull())

    expect(mockedDecide).toHaveBeenCalledWith({ data: { draftId: 'kbrd_1', decision: 'approved' } })
  })

  it('should send a rejection and remove the draft from the list', async () => {
    render(<RewordedDraftsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(screen.queryByTestId('reworded-draft-kbrd_1')).toBeNull())

    expect(mockedDecide).toHaveBeenCalledWith({ data: { draftId: 'kbrd_1', decision: 'rejected' } })
  })

  it('should keep the draft and show an error when the decision fails', async () => {
    mockedDecide.mockResolvedValue({ ok: false, error: 'boom', status: 500 })

    render(<RewordedDraftsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't save")
    expect(screen.getByTestId('reworded-draft-kbrd_1')).toBeTruthy()
  })
})
