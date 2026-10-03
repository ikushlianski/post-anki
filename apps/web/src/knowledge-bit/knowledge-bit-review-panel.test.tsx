// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  editKnowledgeBitForReview,
  editKnowledgeBitQuestionVariantForReview,
  rejectKnowledgeBitForReview,
} from './knowledge-bit-review.api'

vi.mock('./knowledge-bit-review.api', () => ({
  approveKnowledgeBitForReview: vi.fn(),
  rejectKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
}))

const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
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
  bits: [
    {
      id: 'bit-1',
      body: 'Turbopuffer writes to a WAL before indexing.',
      background: 'Durability guarantee for writes.',
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

  it('removes the bit and the whole source when approve succeeds and it was the only bit', async () => {
    mockedApprove.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-item-bit-1')).toBeNull()
    })

    expect(screen.queryByTestId('knowledge-bit-review-source-src-1')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-empty-state')).toBeDefined()
    expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
  })

  it('removes the bit when reject succeeds, keeping the panel retry-friendly on a later failure', async () => {
    mockedReject.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-reject-bit-1'))

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-item-bit-1')).toBeNull()
    })

    expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
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

  it('edits a variant then approves, sending the edited text and leaving the bit approvable', async () => {
    mockedEditVariant.mockResolvedValue({ ok: true, variantId: 'var-2' })
    mockedApprove.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-var-1'))

    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-1'), {
      target: { value: 'What is written first?' },
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-answer-var-1'), {
      target: { value: 'The write-ahead log.' },
    })

    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-var-1'))

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenCalledWith({
        data: { variantId: 'var-1', prompt: 'What is written first?', answer: 'The write-ahead log.' },
      })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-variant-var-1')).toBeNull()
    })

    expect(screen.getByTestId('knowledge-bit-review-variant-var-2')).toBeDefined()
    expect(screen.getByText('What is written first?')).toBeDefined()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-bit-1'))

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'bit-1' } })
    })
  })

  it('sends a second edit against the new variant id returned by the first edit', async () => {
    mockedEditVariant.mockResolvedValueOnce({ ok: true, variantId: 'var-2' })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-var-1'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-1'), {
      target: { value: 'First edit?' },
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-answer-var-1'), {
      target: { value: 'First answer.' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-var-1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-variant-var-2')).toBeDefined()
    })

    mockedEditVariant.mockResolvedValueOnce({ ok: true, variantId: 'var-3' })

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-var-2'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-2'), {
      target: { value: 'Second edit?' },
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-answer-var-2'), {
      target: { value: 'Second answer.' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-var-2'))

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenLastCalledWith({
        data: { variantId: 'var-2', prompt: 'Second edit?', answer: 'Second answer.' },
      })
    })
  })

  it('keeps the editor open with the draft intact when an edit save fails', async () => {
    mockedEditVariant.mockRejectedValue(new Error('network error'))

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-var-1'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-1'), {
      target: { value: 'What is written first?' },
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-answer-var-1'), {
      target: { value: 'The write-ahead log.' },
    })

    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-var-1'))

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenCalled()
    })

    expect(screen.getByTestId('knowledge-bit-review-edit-prompt-var-1')).toHaveProperty(
      'value',
      'What is written first?',
    )
    expect(screen.queryByTestId('knowledge-bit-review-variant-var-1')).toBeNull()

    expect(
      (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('edits the bit\'s own fact text and background, sending the edited text', async () => {
    mockedEditBit.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-bit-button-bit-1'))

    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-body-bit-1'), {
      target: { value: 'Turbopuffer writes to a WAL first, then indexes.' },
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-background-bit-1'), {
      target: { value: 'Revised durability note.' },
    })

    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-bit-bit-1'))

    await waitFor(() => {
      expect(mockedEditBit).toHaveBeenCalledWith({
        data: {
          bitId: 'bit-1',
          body: 'Turbopuffer writes to a WAL first, then indexes.',
          background: 'Revised durability note.',
        },
      })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-edit-bit-bit-1')).toBeNull()
    })

    expect(screen.getByText('Turbopuffer writes to a WAL first, then indexes.')).toBeDefined()
    expect(screen.getByText('Revised durability note.')).toBeDefined()
  })

  it('clears the now-stale question variants when a bit-text edit changes the body, since the server deletes them', async () => {
    mockedEditBit.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-bit-button-bit-1'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-body-bit-1'), {
      target: { value: 'A changed fact that invalidates the old question.' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-bit-bit-1'))

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-edit-bit-bit-1')).toBeNull()
    })

    expect(screen.queryByTestId('knowledge-bit-review-variant-var-1')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-no-variants-bit-1')).toBeDefined()
  })

  it('keeps the existing question variants when a bit-text edit only touches the background', async () => {
    mockedEditBit.mockResolvedValue({ ok: true })

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-bit-button-bit-1'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-background-bit-1'), {
      target: { value: 'Only the background changed.' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-bit-bit-1'))

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-edit-bit-bit-1')).toBeNull()
    })

    expect(screen.getByTestId('knowledge-bit-review-variant-var-1')).toBeDefined()
    expect(screen.getByText('What happens before indexing?')).toBeDefined()
  })

  it('blocks approve/reject/cancel while a variant edit is still saving, preventing a stale approve racing an in-flight edit', async () => {
    const pendingSave = deferred<{ ok: true; variantId: string }>()
    mockedEditVariant.mockReturnValue(pendingSave.promise)

    renderPanel()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-var-1'))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-prompt-var-1'), {
      target: { value: 'Edited while saving?' },
    })
    fireEvent.change(screen.getByTestId('knowledge-bit-review-edit-answer-var-1'), {
      target: { value: 'Edited answer.' },
    })

    fireEvent.click(screen.getByTestId('knowledge-bit-review-save-var-1'))

    await waitFor(() => {
      expect(mockedEditVariant).toHaveBeenCalled()
    })

    // The save is still in flight — Approve/Reject must stay disabled, and
    // Cancel must not be able to close the editor out from under it (that
    // was the exact race: cancel, then approve the pre-edit content while
    // the edit resolves in the background).
    expect(
      (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByTestId('knowledge-bit-review-reject-bit-1') as HTMLButtonElement).disabled,
    ).toBe(true)

    const cancel = screen.getByTestId('knowledge-bit-review-cancel-var-1') as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.click(cancel)
    expect(screen.getByTestId('knowledge-bit-review-edit-prompt-var-1')).toBeDefined()

    pendingSave.resolve({ ok: true, variantId: 'var-2' })

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-edit-prompt-var-1')).toBeNull()
    })

    expect(
      (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('disables starting a second editor while one is already open', () => {
    const twoVariantSource: PendingKnowledgeSourceForReview = {
      ...SOURCE,
      bits: [
        {
          ...SOURCE.bits[0]!,
          variants: [
            ...SOURCE.bits[0]!.variants,
            { id: 'var-2', kind: 'wh_question', prompt: 'A second question?', answer: 'A second answer.' },
          ],
        },
      ],
    }

    renderPanel([twoVariantSource])

    fireEvent.click(screen.getByTestId('knowledge-bit-review-edit-var-1'))

    expect(
      (screen.getByTestId('knowledge-bit-review-edit-var-2') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByTestId('knowledge-bit-review-edit-bit-button-bit-1') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('shows a fallback when a bit has no generated question variants yet', () => {
    const noVariantSource: PendingKnowledgeSourceForReview = {
      ...SOURCE,
      bits: [{ ...SOURCE.bits[0]!, variants: [] }],
    }

    renderPanel([noVariantSource])

    expect(screen.getByTestId('knowledge-bit-review-no-variants-bit-1')).toBeDefined()
    expect(
      (screen.getByTestId('knowledge-bit-review-approve-bit-1') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByTestId('knowledge-bit-review-reject-bit-1') as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})
