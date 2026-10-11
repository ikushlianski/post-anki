// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  getPendingKnowledgeBitsForReview,
  rejectKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
  setKnowledgeBitFeedbackReasonForReview,
} from './knowledge-bit-review.api'
import { WHY_STRIP_VISIBLE_MS } from './knowledge-bit-review-why'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('./knowledge-bit-review.api', () => ({
  approveKnowledgeBitForReview: vi.fn(),
  rejectKnowledgeBitForReview: vi.fn(),
  restoreKnowledgeBitForReview: vi.fn(),
  setKnowledgeBitFeedbackReasonForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedRestore = vi.mocked(restoreKnowledgeBitForReview)
const mockedSetReason = vi.mocked(setKnowledgeBitFeedbackReasonForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)

const SOURCE: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'src-1',
  sourceText: 'Some pasted text.',
  bits: [
    {
      id: 'bit-1',
      body: 'First claim.',
      background: null,
      variants: [{ id: 'var-1', kind: 'basic', prompt: 'First question?', answer: 'First answer.' }],
    },
    {
      id: 'bit-2',
      body: 'Second claim.',
      background: null,
      variants: [{ id: 'var-2', kind: 'basic', prompt: 'Second question?', answer: 'Second answer.' }],
    },
  ],
}

function renderPanel() {
  return render(<KnowledgeBitReviewPanel initialSources={[SOURCE]} />)
}

describe('rejecting a suggestion and saying why afterwards', () => {
  beforeEach(() => {
    mockedReject.mockReset()
    mockedRestore.mockReset()
    mockedSetReason.mockReset()
    mockedGetPending.mockReset()
    mockedGetPending.mockResolvedValue([])
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
    mockedSetReason.mockResolvedValue({ ok: true })
    mockedRestore.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should reject at once with one tap and no reason asked first', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-item-bit-1')).toBeNull()
    })
    expect(mockedSetReason).not.toHaveBeenCalled()
  })

  it('should offer the reasons after the card is gone', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-why-strip')).toBeDefined()
    })
    expect(screen.getByTestId('knowledge-bit-review-why-reason-wrong_language')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-why-reason-meta_wording')).toBeDefined()
  })

  it('should store the chosen reason on the rejection that was already written', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-why-reason-meta_wording'))

    await waitFor(() => {
      expect(mockedSetReason).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'meta_wording' },
      })
    })
  })

  it('should send the optional note together with the reason', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    fireEvent.change(await screen.findByTestId('knowledge-bit-review-why-note'), {
      target: { value: 'says according to the text' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-why-reason-meta_wording'))

    await waitFor(() => {
      expect(mockedSetReason).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'meta_wording', note: 'says according to the text' },
      })
    })
  })

  it('should add a note after the reason was already chosen', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-why-reason-too_vague_or_no_context'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-why-note'), { target: { value: 'no subject' } })
    fireEvent.keyDown(screen.getByTestId('knowledge-bit-review-why-note'), { key: 'Enter' })

    await waitFor(() => {
      expect(mockedSetReason).toHaveBeenLastCalledWith({
        data: { feedbackId: 'fb-1', reasonCode: 'too_vague_or_no_context', note: 'no subject' },
      })
    })
  })

  it('should leave the rejection without a reason and hide the strip when it is ignored', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPanel()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    await screen.findByTestId('knowledge-bit-review-why-strip')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WHY_STRIP_VISIBLE_MS + 100)
    })

    expect(screen.queryByTestId('knowledge-bit-review-why-strip')).toBeNull()
    expect(mockedSetReason).not.toHaveBeenCalled()
  })

  it('should keep the strip open while the reviewer is still choosing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPanel()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    await screen.findByTestId('knowledge-bit-review-why-strip')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WHY_STRIP_VISIBLE_MS - 1000)
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-why-note'), { target: { value: 'x' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WHY_STRIP_VISIBLE_MS - 1000)
    })

    expect(screen.getByTestId('knowledge-bit-review-why-strip')).toBeDefined()
  })

  it('should bring the suggestion back with undo', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-why-undo'))

    await waitFor(() => {
      expect(mockedRestore).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-item-bit-1')).toBeDefined()
    })
    expect(screen.queryByTestId('knowledge-bit-review-why-strip')).toBeNull()
  })

  it('should put the restored suggestion back in its original position', async () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-why-undo'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-item-bit-1')).toBeDefined()
    })

    const ids = screen
      .getAllByTestId(/^knowledge-bit-review-item-/)
      .map((element) => element.getAttribute('data-testid'))

    expect(ids).toEqual(['knowledge-bit-review-item-bit-1', 'knowledge-bit-review-item-bit-2'])
  })

  it('should say so when undo fails and keep the suggestion rejected on screen', async () => {
    mockedRestore.mockRejectedValue(new Error('offline'))
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-why-undo'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-why-error')).toBeDefined()
    })
    expect(screen.queryByTestId('knowledge-bit-review-item-bit-1')).toBeNull()
  })

  it('should ask for the reason after the r key rejects the focused suggestion', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: 'r' })

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
    expect(await screen.findByTestId('knowledge-bit-review-why-strip')).toBeDefined()
  })

  it('should not ask for a reason when the rejection could not be stored', async () => {
    mockedReject.mockRejectedValue(new Error('offline'))
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-error-bit-1')).toBeDefined()
    })
    expect(screen.queryByTestId('knowledge-bit-review-why-strip')).toBeNull()
  })

  it('should show only undo when the server gave no feedback id to attach a reason to', async () => {
    mockedReject.mockResolvedValue({ ok: true, feedbackId: null })
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    expect(await screen.findByTestId('knowledge-bit-review-why-undo')).toBeDefined()
    expect(screen.queryByTestId('knowledge-bit-review-why-reason-other')).toBeNull()
  })

  it('should switch the strip to the newest rejection when another card is rejected', async () => {
    mockedReject
      .mockResolvedValueOnce({ ok: true, feedbackId: 'fb-1' })
      .mockResolvedValueOnce({ ok: true, feedbackId: 'fb-2' })
    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))
    await screen.findByTestId('knowledge-bit-review-why-strip')
    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-2'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-why-reason-bad_format'))

    await waitFor(() => {
      expect(mockedSetReason).toHaveBeenCalledWith({
        data: { feedbackId: 'fb-2', reasonCode: 'bad_format' },
      })
    })
  })
})
