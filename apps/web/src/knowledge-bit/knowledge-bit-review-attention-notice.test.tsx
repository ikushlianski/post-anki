// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { KnowledgeSourceAttention, PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewAttentionNotice } from './knowledge-bit-review-attention-notice'
import type { SourceRegenerationState } from './knowledge-bit-review-regeneration'

afterEach(cleanup)

function notice(overrides: Partial<KnowledgeSourceAttention> = {}): PendingKnowledgeSourceForReview {
  return {
    knowledgeSourceId: 's1',
    sourceText: null,
    subjectName: null,
    bits: [],
    attention: {
      knowledgeSourceId: 's1',
      kind: 'failed',
      reason: 'no_valid_items',
      firstWords: 'Photosynthesis turns light into sugar',
      sourceText: 'Photosynthesis turns light into sugar in the leaf.',
      since: new Date(Date.now() - 5 * 60_000).toISOString(),
      ...overrides,
    },
  }
}

function renderNotice(
  source: PendingKnowledgeSourceForReview,
  regeneration?: SourceRegenerationState,
  handlers: Partial<{
    onRetry: (id: string) => void
    onRetryWithText: (id: string, text: string) => void
    onDiscard: (id: string) => Promise<boolean>
  }> = {},
) {
  return render(
    <ul>
      <KnowledgeBitReviewAttentionNotice
        source={source}
        regeneration={regeneration}
        onRetry={handlers.onRetry ?? vi.fn()}
        onRetryWithText={handlers.onRetryWithText ?? vi.fn()}
        onDiscard={handlers.onDiscard ?? vi.fn().mockResolvedValue(true)}
      />
    </ul>,
  )
}

const text = (suffix: string) => screen.getByTestId(`knowledge-bit-review-attention-s1-${suffix}`).textContent

describe('KnowledgeBitReviewAttentionNotice', () => {
  it('should show the first words, how long ago and a plain reason for a failed note', () => {
    renderNotice(notice())

    expect(text('first-words')).toBe('Photosynthesis turns light into sugar')
    expect(text('time')).toBe('5 minutes ago')
    expect(text('reason')).toBe('The AI could not produce a usable card from this note.')
    expect(screen.getByTestId('knowledge-bit-review-attention-s1-details').textContent).toContain(
      'Photosynthesis turns light into sugar in the leaf.',
    )
  })

  it('should say the AI found nothing when a note finished with no cards', () => {
    renderNotice(notice({ kind: 'empty_result', reason: null }))

    expect(text('reason')).toBe('The AI finished but found nothing to turn into a card.')
  })

  it('should say a note is still working after 20 minutes and offer retry to take it over', () => {
    renderNotice(notice({ kind: 'stuck', reason: null }))

    expect(text('reason')).toBe('Still working after more than 20 minutes.')
    expect(screen.getByTestId('knowledge-bit-review-attention-s1-retry')).toBeTruthy()
  })

  it('should show a busy AI service as information with no retry buttons', () => {
    renderNotice(notice({ kind: 'rate_limited', reason: 'provider_rate_limited' }))

    expect(text('reason')).toContain('The AI service is busy')
    expect(screen.queryByTestId('knowledge-bit-review-attention-s1-retry')).toBeNull()
    expect(screen.queryByTestId('knowledge-bit-review-attention-s1-discard')).toBeNull()
  })

  it('should never print a raw failure code or error text', () => {
    renderNotice(notice({ reason: 'TypeError: boom at line 4' }))

    expect(text('reason')).toBe('Something went wrong while reading this note. Retry usually fixes it.')
  })

  it('should offer Retry now, Edit text and retry and Discard', () => {
    renderNotice(notice())

    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit text and retry' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy()
  })

  it('should start a retry for this note when Retry now is pressed', () => {
    const onRetry = vi.fn()

    renderNotice(notice(), undefined, { onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }))

    expect(onRetry).toHaveBeenCalledWith('s1')
  })

  it('should show Retrying and lock the actions while a retry runs', () => {
    renderNotice(notice(), { phase: 'running' })

    expect(text('status')).toBe('Retrying…')
    expect(screen.queryByRole('button', { name: 'Retry now' })).toBeNull()
  })

  it('should show the failure message and bring the actions back when a retry could not start', () => {
    renderNotice(notice(), { phase: 'failed', message: "Couldn't start. Try again." })

    expect(text('error')).toBe("Couldn't start. Try again.")
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy()
  })

  it('should retry with the edited text and trim it', () => {
    const onRetryWithText = vi.fn()

    renderNotice(notice(), undefined, { onRetryWithText })
    fireEvent.click(screen.getByRole('button', { name: 'Edit text and retry' }))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-attention-s1-text'), {
      target: { value: '  New cleaner note  ' },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-edit-submit'))

    expect(onRetryWithText).toHaveBeenCalledWith('s1', 'New cleaner note')
  })

  it('should refuse empty edited text inline and change nothing', () => {
    const onRetryWithText = vi.fn()

    renderNotice(notice(), undefined, { onRetryWithText })
    fireEvent.click(screen.getByRole('button', { name: 'Edit text and retry' }))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-attention-s1-text'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-edit-submit'))

    expect(text('problem')).toBe('Enter some text to retry with.')
    expect(onRetryWithText).not.toHaveBeenCalled()
  })

  it('should refuse edited text over 50,000 characters inline', () => {
    const onRetryWithText = vi.fn()

    renderNotice(notice(), undefined, { onRetryWithText })
    fireEvent.click(screen.getByRole('button', { name: 'Edit text and retry' }))
    fireEvent.change(screen.getByTestId('knowledge-bit-review-attention-s1-text'), {
      target: { value: 'a'.repeat(50_001) },
    })
    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-edit-submit'))

    expect(text('problem')).toContain('over 50,000 characters')
    expect(onRetryWithText).not.toHaveBeenCalled()
  })

  it('should ask before discarding and say the text will be deleted', () => {
    const onDiscard = vi.fn().mockResolvedValue(true)

    renderNotice(notice(), undefined, { onDiscard })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(text('discard-panel')).toContain('Its text will be deleted')
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('should keep the notice when discarding is cancelled', () => {
    const onDiscard = vi.fn().mockResolvedValue(true)

    renderNotice(notice(), undefined, { onDiscard })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard-cancel'))

    expect(onDiscard).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy()
  })

  it('should discard the note once the reviewer confirms', async () => {
    const onDiscard = vi.fn().mockResolvedValue(true)

    renderNotice(notice(), undefined, { onDiscard })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard-confirm'))
    })

    expect(onDiscard).toHaveBeenCalledWith('s1')
  })

  it('should say discarding failed and keep the notice with its actions', async () => {
    renderNotice(notice(), undefined, { onDiscard: vi.fn().mockResolvedValue(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-attention-s1-discard-confirm'))
    })

    expect(text('discard-error')).toBe("Couldn't discard this note. Try again.")
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy()
  })
})
