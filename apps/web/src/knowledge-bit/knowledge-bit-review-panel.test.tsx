// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  editKnowledgeBitForReview,
  editKnowledgeBitQuestionVariantForReview,
  rejectKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
} from './knowledge-bit-review.api'

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
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedRestore = vi.mocked(restoreKnowledgeBitForReview)
const mockedEditVariant = vi.mocked(editKnowledgeBitQuestionVariantForReview)
const mockedEditBit = vi.mocked(editKnowledgeBitForReview)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const SOURCE: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: 'src-1',
  sourceText: 'Turbopuffer uses a WAL-first design so writes are durable before indexing.',
  subjectName: null,
  bits: [
    {
      id: 'bit-1',
      body: 'Turbopuffer writes to a WAL before indexing.',
      background: 'Durability guarantee for writes.',
      origin: 'extracted', isAiGenerated: false, sourceLinks: [],
      variants: [
        { id: 'var-1', kind: 'wh_question', prompt: 'What happens before indexing?', answer: 'A WAL write.' },
      ],
    },
  ],
}

function renderPanel(sources: PendingKnowledgeSourceForReview[] = [SOURCE]) {
  return render(<KnowledgeBitReviewPanel initialSources={sources} />)
}

describe('KnowledgeBitReviewPanel', () => {
  beforeEach(() => {
    mockedApprove.mockReset()
    mockedReject.mockReset()
    mockedRestore.mockReset()
    mockedEditVariant.mockReset()
    mockedEditBit.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an empty state when there are no pending sources', () => {
    renderPanel([])

    expect(screen.getByTestId('knowledge-bit-review-empty-state')).toBeDefined()
  })

  it('renders each pending source grouped with its bits and question variants', () => {
    renderPanel()

    expect(screen.getByTestId('knowledge-bit-review-source-src-1')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-item-bit-1')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-variant-var-1')).toBeDefined()
    expect(screen.getByText('What happens before indexing?')).toBeDefined()
    expect(screen.getByText('A WAL write.')).toBeDefined()
  })

  it('keeps an approved card in the list as Approved instead of dropping the row', async () => {
    mockedApprove.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-status-bit-1').textContent).toBe('Approved')
    })

    expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    expect(screen.queryByTestId('knowledge-bit-review-approve-bit-1')).toBeNull()
    expect(screen.queryByTestId('knowledge-bit-review-empty-state')).toBeNull()
  })

  it('keeps a rejected card in the list as Rejected instead of dropping the row', async () => {
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-status-bit-1').textContent).toBe('Rejected')
    })

    expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
  })

  it('gives a decided card a 44px Undo that puts it back to pending', async () => {
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb-1' })
    mockedRestore.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    const undo = await screen.findByTestId('knowledge-bit-review-undo-bit-1')

    expect(undo.className).toContain('min-h-11')

    fireEvent.click(undo)

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-approve-bit-1')).toBeDefined()
    })

    expect(mockedRestore).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    expect(screen.queryByTestId('knowledge-bit-review-status-bit-1')).toBeNull()
  })

  it('keeps the card decided and shows an error when Undo fails', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    mockedRestore.mockRejectedValue(new Error('network error'))

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-undo-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-error-bit-1').textContent).toBe(
        "Couldn't undo. Try again.",
      )
    })

    expect(screen.getByTestId('knowledge-bit-review-status-bit-1').textContent).toBe('Approved')
  })

  it('keeps the bit listed and re-enabled when reject fails', async () => {
    mockedReject.mockRejectedValue(new Error('network error'))

    renderPanel()

    const reject = screen.getByTestId('knowledge-bit-review-reject-bit-1') as HTMLButtonElement
    fireEvent.click(reject)

    await waitFor(() => {
      expect(reject.disabled).toBe(false)
    })

    expect(screen.getByTestId('knowledge-bit-review-item-bit-1')).toBeDefined()
  })

  const SAVE_WAIT = { timeout: 4000 }

  function typeInto(testId: string, value: string) {
    fireEvent.change(screen.getByTestId(testId), { target: { value } })
  }

  it('saves a card edit by itself, then approves with the edited text', async () => {
    mockedEditVariant.mockResolvedValue({ ok: true, variantId: 'var-2' })
    mockedApprove.mockResolvedValue({ ok: true })

    renderPanel()

    typeInto('knowledge-bit-review-edit-prompt-var-1', 'What is written first?')
    typeInto('knowledge-bit-review-edit-answer-var-1', 'The write-ahead log.')

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenCalledWith({
        data: { variantId: 'var-1', prompt: 'What is written first?', answer: 'The write-ahead log.' },
      })
    }, SAVE_WAIT)

    await waitFor(() => {
      expect(
        (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
      ).toBe(false)
    }, SAVE_WAIT)

    expect((screen.getByTestId('knowledge-bit-review-edit-prompt-var-2') as HTMLTextAreaElement).value).toBe(
      'What is written first?',
    )

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
  })

  it('sends a second edit against the new variant id returned by the first edit', async () => {
    mockedEditVariant.mockResolvedValueOnce({ ok: true, variantId: 'var-2' })

    renderPanel()

    typeInto('knowledge-bit-review-edit-prompt-var-1', 'First edit?')

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-edit-prompt-var-2')).toBeDefined()
    }, SAVE_WAIT)

    mockedEditVariant.mockResolvedValueOnce({ ok: true, variantId: 'var-3' })
    typeInto('knowledge-bit-review-edit-prompt-var-2', 'Second edit?')

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenLastCalledWith({
        data: { variantId: 'var-2', prompt: 'Second edit?', answer: 'A WAL write.' },
      })
    }, SAVE_WAIT)
  })

  it('keeps the typed text and blocks approve when saving a card fails', async () => {
    mockedEditVariant.mockRejectedValue(new Error('network error'))

    renderPanel()

    typeInto('knowledge-bit-review-edit-prompt-var-1', 'Will not save?')

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenCalled()
    }, SAVE_WAIT)

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-autosave-status-var-1').textContent).toContain('Could not save')
    })

    expect((screen.getByTestId('knowledge-bit-review-edit-prompt-var-1') as HTMLTextAreaElement).value).toBe(
      'Will not save?',
    )
    expect((screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled).toBe(true)
  })

  it('blocks approve and reject while a card edit is still saving', async () => {
    const saving = deferred<{ ok: true; variantId: string }>()

    mockedEditVariant.mockReturnValue(saving.promise)

    renderPanel()

    typeInto('knowledge-bit-review-edit-prompt-var-1', 'Racing edit?')

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenCalled()
    }, SAVE_WAIT)

    expect((screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('knowledge-bit-review-reject-bit-1') as HTMLButtonElement).disabled).toBe(true)

    saving.resolve({ ok: true, variantId: 'var-2' })

    await waitFor(() => {
      expect((screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled).toBe(false)
    }, SAVE_WAIT)
  })

  it('shows a basic card as front and back and lets a bit with only that card be approved', () => {
    const basicSource: PendingKnowledgeSourceForReview = {
      ...SOURCE,
      bits: [
        {
          ...SOURCE.bits[0]!,
          variants: [{ id: 'var-basic', kind: 'basic', prompt: 'What is a WAL?', answer: 'A write-ahead log.' }],
        },
      ],
    }

    renderPanel([basicSource])

    expect((screen.getByTestId('knowledge-bit-review-edit-prompt-var-basic') as HTMLTextAreaElement).value).toBe(
      'What is a WAL?',
    )
    expect((screen.getByTestId('knowledge-bit-review-edit-answer-var-basic') as HTMLTextAreaElement).value).toBe(
      'A write-ahead log.',
    )
    expect(
      (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('shows a per-row error and keeps the bit listed when approve fails', async () => {
    mockedApprove.mockRejectedValue(new Error('network error'))

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-error-bit-1').textContent).toBe(
        "Couldn't approve. Try again.",
      )
    })

    expect(screen.getByTestId('knowledge-bit-review-item-bit-1')).toBeDefined()
  })

  it('shows a per-row error when reject fails', async () => {
    mockedReject.mockRejectedValue(new Error('network error'))

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-error-bit-1').textContent).toBe(
        "Couldn't reject. Try again.",
      )
    })
  })

  it('shows a fallback when a bit has no generated question variants yet', () => {
    const noVariantSource: PendingKnowledgeSourceForReview = {
      ...SOURCE,
      bits: [{ ...SOURCE.bits[0]!, variants: [] }],
    }

    renderPanel([noVariantSource])

    expect(screen.getByTestId('knowledge-bit-review-no-variants-bit-1').textContent).toBe(
      'Writing cards…',
    )
    expect(
      (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByTestId('knowledge-bit-review-reject-bit-1') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('shows how many bits are ready out of all bits while cards are still being written', () => {
    const mixedSource: PendingKnowledgeSourceForReview = {
      ...SOURCE,
      bits: [
        SOURCE.bits[0]!,
        { id: 'bit-2', body: 'Second fact.', background: null, origin: 'extracted', isAiGenerated: false, sourceLinks: [], variants: [] },
        { id: 'bit-3', body: 'Third fact.', background: null, origin: 'extracted', isAiGenerated: false, sourceLinks: [], variants: [] },
      ],
    }

    renderPanel([mixedSource])

    expect(screen.getByTestId('knowledge-bit-review-progress').textContent).toBe(
      'Writing cards… 1 of 3 ready',
    )
  })

  it('hides the progress line once every bit has its cards', () => {
    renderPanel([SOURCE])

    expect(screen.queryByTestId('knowledge-bit-review-progress')).toBeNull()
  })
})
