// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewPanel } from './knowledge-bit-review-panel'
import {
  getKnowledgeSourceRegenerationForReview,
  getPendingKnowledgeBitsForReview,
  regenerateKnowledgeSourceForReview,
} from './knowledge-bit-review.api'
import { REGENERATION_POLL_INTERVAL_MS } from './knowledge-bit-review-regeneration'
import { pickSearchableOption } from '../ui/searchable-select-test-utils'

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
  gradeKnowledgeBitForReview: vi.fn(),
  updateKnowledgeBitFeedbackForReview: vi.fn(),
  regenerateKnowledgeSourceForReview: vi.fn(),
  getKnowledgeSourceRegenerationForReview: vi.fn(),
}))

const mockedRegenerate = vi.mocked(regenerateKnowledgeSourceForReview)
const mockedStatus = vi.mocked(getKnowledgeSourceRegenerationForReview)
const mockedGetPending = vi.mocked(getPendingKnowledgeBitsForReview)

function bit(id: string) {
  return {
    id,
    body: `Body ${id}`,
    background: null,
    origin: 'extracted' as const, isAiGenerated: false, sourceLinks: [],
    variants: [{ id: `var-${id}`, kind: 'wh_question' as const, prompt: `Q ${id}`, answer: `A ${id}` }],
  }
}

function source(id: string, bitIds: string[], sourceText: string | null = 'text') {
  return { knowledgeSourceId: id, sourceText, subjectName: null, bits: bitIds.map(bit) } satisfies PendingKnowledgeSourceForReview
}

function renderPanel(sources: PendingKnowledgeSourceForReview[]) {
  return render(<KnowledgeBitReviewPanel initialSources={sources} />)
}

function openConfirm(sourceId = 's1') {
  fireEvent.click(screen.getByTestId(`knowledge-bit-review-regenerate-${sourceId}`))
}

async function confirm(sourceId = 's1') {
  openConfirm(sourceId)
  await act(async () => {
    fireEvent.click(screen.getByTestId(`knowledge-bit-review-regenerate-${sourceId}-confirm`))
  })
}

describe('KnowledgeBitReviewPanel regeneration', () => {
  beforeEach(() => {
    mockedRegenerate.mockReset()
    mockedStatus.mockReset()
    mockedGetPending.mockReset()
    mockedGetPending.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should ask the reviewer to confirm and name how many undecided suggestions get replaced', () => {
    renderPanel([source('s1', ['b1', 'b2'])])

    openConfirm()

    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1-confirm-panel').textContent).toContain(
      'Replace 2 undecided suggestions from this source? Approved and rejected ones stay.',
    )
    expect(mockedRegenerate).not.toHaveBeenCalled()
  })

  it('should show every model with its price per 1M tokens as soon as Regenerate is pressed', () => {
    renderPanel([source('s1', ['b1'])])

    openConfirm()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-regenerate-s1-model'))

    const options = screen.getAllByRole('option').map((option) => option.textContent)

    expect(options[0]).toBe('Same model as before')
    expect(options).toContain('GPT-6 Luna — $0.10 in / $0.50 out per 1M')
    expect(options).toContain('GPT-5 Mini — $0.25 in / $2.00 out per 1M')
  })

  it('should leave everything untouched when the reviewer cancels the confirmation', () => {
    renderPanel([source('s1', ['b1'])])

    openConfirm()
    fireEvent.click(screen.getByTestId('knowledge-bit-review-regenerate-s1-cancel'))

    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-source-count-s1').textContent).toBe('1 suggestion')
    expect(mockedRegenerate).not.toHaveBeenCalled()
  })

  it('should not offer Regenerate for a source whose text is gone', () => {
    renderPanel([source('s1', ['b1'], null)])

    expect(screen.queryByTestId('knowledge-bit-review-regenerate-s1')).toBeNull()
  })

  it('should send the chosen model and show a disabled Regenerating state while the group stays visible', async () => {
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 1 })
    renderPanel([source('s1', ['b1'])])

    openConfirm()
    pickSearchableOption('knowledge-bit-review-regenerate-s1-model', 'openrouter/openai/gpt-4o-mini')
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-regenerate-s1-confirm'))
    })

    expect(mockedRegenerate).toHaveBeenCalledWith({
      data: { sourceId: 's1', modelId: 'openrouter/openai/gpt-4o-mini' },
    })

    const status = screen.getByTestId('knowledge-bit-review-regenerate-s1-status')

    expect(status.textContent).toBe('Regenerating…')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(
      (screen.getByTestId('knowledge-bit-review-regenerate-s1') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByTestId('knowledge-bit-review-source-count-s1').textContent).toBe('0 suggestions')
    expect(screen.getByTestId('knowledge-bit-review-source-s1')).toBeDefined()
  })

  it('should treat a 409 as already running and keep waiting for the existing run', async () => {
    mockedRegenerate.mockResolvedValue({ status: 'already_running' })
    renderPanel([source('s1', ['b1'])])

    await confirm()

    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1-status').textContent).toBe(
      'Regenerating…',
    )
    expect(screen.queryByTestId('knowledge-bit-review-regenerate-s1-retry')).toBeNull()
    expect(screen.getByTestId('knowledge-bit-review-source-count-s1').textContent).toBe('0 suggestions')
  })

  it('should send one request when the confirm button is clicked twice', async () => {
    let finish!: (value: { status: 'running'; supersededCount: number }) => void

    mockedRegenerate.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderPanel([source('s1', ['b1'])])

    openConfirm()

    const button = screen.getByTestId('knowledge-bit-review-regenerate-s1-confirm')

    fireEvent.click(button)
    fireEvent.click(button)
    await act(async () => finish({ status: 'running', supersededCount: 1 }))

    expect(mockedRegenerate).toHaveBeenCalledTimes(1)
  })

  it('should keep the suggestions and offer Retry when the request fails to start', async () => {
    mockedRegenerate.mockRejectedValueOnce(new Error('boom'))
    renderPanel([source('s1', ['b1'])])

    await confirm()

    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1-status').textContent).toBe(
      "Couldn't start. Try again.",
    )
    expect(screen.getByTestId('knowledge-bit-review-source-count-s1').textContent).toBe('1 suggestion')

    mockedRegenerate.mockResolvedValueOnce({ status: 'running', supersededCount: 1 })
    await act(async () => {
      fireEvent.click(screen.getByTestId('knowledge-bit-review-regenerate-s1-retry'))
    })

    expect(mockedRegenerate).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1-status').textContent).toBe(
      'Regenerating…',
    )
  })

  it('should append new items while the empty group stays visible and clear the state when done', async () => {
    vi.useFakeTimers()
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 1 })
    renderPanel([source('s1', ['b1'])])
    await confirm()

    mockedStatus.mockResolvedValue({ status: 'running', failureReason: null })
    mockedGetPending.mockResolvedValue([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-source-s1')).toBeDefined()
    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1-status')).toBeDefined()

    mockedStatus.mockResolvedValue({ status: 'done', failureReason: null })
    mockedGetPending.mockResolvedValue([source('s1', ['n1', 'n2'])])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-source-count-s1').textContent).toBe('2 suggestions')
    expect(screen.queryByTestId('knowledge-bit-review-regenerate-s1-status')).toBeNull()
    expect(
      (screen.getByTestId('knowledge-bit-review-regenerate-s1') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('should drop an empty group once the run is done with nothing to show', async () => {
    vi.useFakeTimers()
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 1 })
    renderPanel([source('s1', ['b1'])])
    await confirm()

    mockedStatus.mockResolvedValue({ status: 'done', failureReason: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.queryByTestId('knowledge-bit-review-source-s1')).toBeNull()
  })

  it('should show Retry when the run fails and keep items that already arrived', async () => {
    vi.useFakeTimers()
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 1 })
    renderPanel([source('s1', ['b1'])])
    await confirm()

    mockedStatus.mockResolvedValue({ status: 'failed', failureReason: 'no_valid_items' })
    mockedGetPending.mockResolvedValue([source('s1', ['n1'])])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-source-count-s1').textContent).toBe('1 suggestion')
    expect(screen.getByTestId('knowledge-bit-review-regenerate-s1-retry')).toBeDefined()
  })

  it('should never remove another source or already decided items when one source regenerates', async () => {
    vi.useFakeTimers()
    mockedRegenerate.mockResolvedValue({ status: 'running', supersededCount: 1 })
    renderPanel([source('s1', ['b1']), source('s2', ['c1'])])
    await confirm()

    mockedStatus.mockResolvedValue({ status: 'running', failureReason: null })
    mockedGetPending.mockResolvedValue([source('s2', ['c1'])])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REGENERATION_POLL_INTERVAL_MS)
    })

    expect(screen.getByTestId('knowledge-bit-review-source-count-s2').textContent).toBe('1 suggestion')
    expect(screen.getByTestId('knowledge-bit-review-source-s1')).toBeDefined()
    expect(mockedStatus).toHaveBeenCalledTimes(1)
    expect(mockedStatus).toHaveBeenCalledWith({ data: { sourceId: 's1' } })
  })
})
