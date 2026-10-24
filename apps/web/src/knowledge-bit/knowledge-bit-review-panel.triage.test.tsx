// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  approveKnowledgeBitForReview,
  rejectKnowledgeBitForReview,
  restoreKnowledgeBitForReview,
  triageKnowledgeBitForReview,
  undoTriageKnowledgeBitForReview,
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
  triageKnowledgeBitForReview: vi.fn(),
  undoTriageKnowledgeBitForReview: vi.fn(),
  restoreKnowledgeBitForReview: vi.fn(),
  editKnowledgeBitQuestionVariantForReview: vi.fn(),
  editKnowledgeBitForReview: vi.fn(),
  bulkApproveKnowledgeBitsForReview: vi.fn(),
  getPendingKnowledgeBitsForReview: vi.fn(),
}))

const mockedTriage = vi.mocked(triageKnowledgeBitForReview)
const mockedApprove = vi.mocked(approveKnowledgeBitForReview)
const mockedReject = vi.mocked(rejectKnowledgeBitForReview)
const mockedUndoTriage = vi.mocked(undoTriageKnowledgeBitForReview)
const mockedRestore = vi.mocked(restoreKnowledgeBitForReview)

function bit(id: string, variantKinds: Array<'wh_question' | 'fill_in_the_blank' | 'basic'>) {
  return {
    id,
    body: `Body ${id}`,
    background: null,
    origin: 'extracted' as const,
    isAiGenerated: false,
    sourceLinks: [],
    variants: variantKinds.map((kind, index) => ({
      id: `${id}-v${index + 1}`,
      kind,
      prompt: `Prompt ${id} ${index + 1}`,
      answer: `Answer ${id} ${index + 1}`,
    })),
  }
}

function source(bits: ReturnType<typeof bit>[]): PendingKnowledgeSourceForReview {
  return {
    knowledgeSourceId: 'src-1',
    sourceTitle: 'Source',
    sourceText: 'text',
    bits,
  } as unknown as PendingKnowledgeSourceForReview
}

const MIXED: Array<'wh_question' | 'fill_in_the_blank' | 'basic'> = [
  'wh_question',
  'fill_in_the_blank',
  'basic',
]

describe('KnowledgeBitReviewPanel triage', () => {
  beforeEach(() => {
    mockedTriage.mockReset()
    mockedApprove.mockReset()
    mockedReject.mockReset()
    mockedUndoTriage.mockReset()
    mockedRestore.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('should approve the whole piece with every variation on Return and move to the next piece', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED), bit('b2', MIXED)])]} />)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-status-b1').textContent).toBe('Approved')
    })

    expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
    expect(mockedTriage).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-review-item-b2').getAttribute('data-focused')).toBe('true')
  })

  it('should approve a piece with more than two variations by plain approve with no selection needed', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    render(
      <KnowledgeBitReviewPanel
        initialSources={[source([bit('b1', ['basic', 'fill_in_the_blank', 'wh_question', 'basic'])])]}
      />,
    )

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-b1'))

    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b1' } }))

    expect(mockedTriage).not.toHaveBeenCalled()
  })

  it('should exclude one variation picked with a number key and keep all the others, with no cap', async () => {
    mockedTriage.mockResolvedValue({ ok: true, droppedVariantIds: ['b1-v1'] })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    fireEvent.keyDown(window, { key: '2' })

    expect(screen.getByTestId('knowledge-bit-review-approve-b1').textContent).toBe('Approve 2 of 3')

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-b1'))

    await waitFor(() => expect(mockedTriage).toHaveBeenCalled())

    expect(mockedTriage).toHaveBeenCalledWith({
      data: { bitId: 'b1', keepVariantIds: ['b1-v3', 'b1-v2'] },
    })
    expect(mockedApprove).not.toHaveBeenCalled()
  })

  it('should show only the main preferred card until the Variations section is opened', () => {
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    expect(screen.getByTestId('knowledge-bit-review-variant-b1-b1-v3').getAttribute('data-role')).toBe('main')
    expect(screen.getByTestId('knowledge-bit-review-variations-b1').hidden).toBe(true)

    fireEvent.click(screen.getByTestId('knowledge-bit-review-variations-toggle-b1'))

    expect(screen.getByTestId('knowledge-bit-review-variations-b1').hidden).toBe(false)
    expect(screen.getByTestId('knowledge-bit-review-variant-b1-b1-v1').getAttribute('data-role')).toBe('variation')
    expect(screen.getByTestId('knowledge-bit-review-pick-b1-b1-v1').getAttribute('aria-pressed')).toBe('true')
  })

  it('should approve a single-variant piece directly with Return', async () => {
    mockedApprove.mockResolvedValue({ ok: true })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', ['basic'])])]} />)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith({ data: { bitId: 'b1' } }))

    expect(mockedTriage).not.toHaveBeenCalled()
  })

  it('should reject the focused piece with X', async () => {
    mockedReject.mockResolvedValue({ ok: true, feedbackId: 'fb' })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    fireEvent.keyDown(window, { key: 'x' })

    await waitFor(() => expect(mockedReject).toHaveBeenCalledWith({ data: { bitId: 'b1' } }))
  })

  it('should show an error and keep the piece pending when keeping fails', async () => {
    mockedApprove.mockRejectedValue(new Error('boom'))
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-error-b1')).toBeDefined()
    })
  })

  it('should show Undo after Kept and bring the piece back with its dropped variants', async () => {
    mockedTriage.mockResolvedValue({ ok: true, droppedVariantIds: ['b1-v1', 'b1-v2'] })
    mockedUndoTriage.mockResolvedValue({ ok: true })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED), bit('b2', MIXED)])]} />)

    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: 'Enter' })

    const undoButton = await screen.findByTestId('knowledge-bit-review-undo-b1')

    fireEvent.click(undoButton)

    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-status-b1')).toBeNull()
    })

    expect(mockedUndoTriage).toHaveBeenCalledWith({
      data: { bitId: 'b1', restoreVariantIds: ['b1-v1', 'b1-v2'] },
    })
    expect(mockedRestore).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-review-approve-b1').textContent).toBe('Approve 2 of 3')
  })

  it('should undo the last keep with Z', async () => {
    mockedTriage.mockResolvedValue({ ok: true, droppedVariantIds: ['b1-v1', 'b1-v2'] })
    mockedUndoTriage.mockResolvedValue({ ok: true })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await screen.findByTestId('knowledge-bit-review-status-b1')

    fireEvent.keyDown(window, { key: 'z' })

    await waitFor(() => expect(mockedUndoTriage).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.queryByTestId('knowledge-bit-review-status-b1')).toBeNull()
    })
  })

  it('should keep the piece as Kept and show an error when the undo fails', async () => {
    mockedTriage.mockResolvedValue({ ok: true, droppedVariantIds: ['b1-v1', 'b1-v2'] })
    mockedUndoTriage.mockRejectedValue(new Error('conflict'))
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.click(await screen.findByTestId('knowledge-bit-review-undo-b1'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-bit-review-error-b1').textContent).toBe(
        "Couldn't undo. Try again.",
      )
    })

    expect(screen.getByTestId('knowledge-bit-review-status-b1').textContent).toBe('Kept')
  })

  it('should offer no Undo when the keep dropped nothing', async () => {
    mockedTriage.mockResolvedValue({ ok: true, droppedVariantIds: [] })
    render(<KnowledgeBitReviewPanel initialSources={[source([bit('b1', MIXED)])]} />)

    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await screen.findByTestId('knowledge-bit-review-status-b1')

    expect(screen.queryByTestId('knowledge-bit-review-undo-b1')).toBeNull()
  })
})
