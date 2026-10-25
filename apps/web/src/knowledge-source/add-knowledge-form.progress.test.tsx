// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from './add-knowledge-form'
import { createKnowledgeSource } from './knowledge-source.api'
import {
  getKnowledgeSourceRegenerationForReview,
  getPendingKnowledgeBitsWithAttentionForReview,
} from '../knowledge-bit/knowledge-bit-review.api'
import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({ useLiveQuery: () => ({ data: [] }) }))

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('./knowledge-source.api', () => ({
  createKnowledgeSource: vi.fn(),
  createKnowledgeSources: vi.fn(),
  createKnowledgeSourceFromUrl: vi.fn(),
  checkKnowledgeSourceSubject: vi.fn().mockResolvedValue({ status: 'none' }),
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getKnowledgeSourceRegenerationForReview: vi.fn(),
  getPendingKnowledgeBitsWithAttentionForReview: vi.fn(),
}))

const mockedCreate = vi.mocked(createKnowledgeSource)
const mockedStatus = vi.mocked(getKnowledgeSourceRegenerationForReview)
const mockedGroups = vi.mocked(getPendingKnowledgeBitsWithAttentionForReview)

function bit(id: string, reviewFlag: string | null = null) {
  return {
    id,
    body: 'b',
    background: null,
    variants: [],
    origin: 'extracted' as const,
    isAiGenerated: true,
    sourceLinks: [],
    reviewFlag,
  }
}

async function addNote() {
  mockedCreate.mockResolvedValue({
    id: 'ks_1',
    kind: 'prose',
    rawText: null,
    status: 'pending',
    createdAt: '2026-01-01',
  } as Awaited<ReturnType<typeof createKnowledgeSource>>)

  render(<AddKnowledgeForm />)
  fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Closures capture variables' } })

  await act(async () => {
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))
  })
}

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
}

describe('AddKnowledgeForm outcome feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    mockedCreate.mockReset()
    mockedStatus.mockReset()
    mockedGroups.mockReset()
  })

  it('tells the user problems will show in Knowledge triage and links there right after adding', async () => {
    await addNote()

    expect(screen.getByTestId('knowledge-success-message').textContent).toContain('Knowledge triage')
    expect(screen.getByTestId('knowledge-success-message').textContent).toContain('goes wrong')
    expect(screen.getByTestId('knowledge-success-review-link').getAttribute('href')).toBe('/knowledge-bit-review')
  })

  it('refreshes the sidebar count right after a note is added', async () => {
    const listener = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, listener)
    await addNote()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, listener)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('shows the note as queued, then working while the AI runs', async () => {
    mockedStatus.mockResolvedValue({ status: 'running', failureReason: null })
    await addNote()

    expect(screen.getByTestId('knowledge-added-note-status-ks_1').textContent).toContain('Queued')

    await tick()

    expect(screen.getByTestId('knowledge-added-note-status-ks_1').textContent).toContain('Working')
  })

  it('shows ready with the card count and refreshes the sidebar when the note finishes', async () => {
    mockedStatus.mockResolvedValue({ status: 'done', failureReason: null })
    mockedGroups.mockResolvedValue([
      { knowledgeSourceId: 'ks_1', sourceText: null, subjectName: null, bits: [bit('a'), bit('b', 'bad_card')] },
    ])
    await addNote()

    const listener = vi.fn()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, listener)
    await tick()
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, listener)

    expect(screen.getByTestId('knowledge-added-note-status-ks_1').textContent).toContain('Ready with 2 cards')
    expect(screen.getByTestId('knowledge-added-note-status-ks_1').textContent).toContain('1 of them need a manual check')
    expect(listener).toHaveBeenCalled()
  })

  it('shows needs attention with a plain reason and a triage link when the note fails', async () => {
    mockedStatus.mockResolvedValue({ status: 'failed', failureReason: 'no_valid_items' })
    await addNote()
    await tick()

    const text = screen.getByTestId('knowledge-added-note-status-ks_1').textContent ?? ''

    expect(text).toContain('Needs attention')
    expect(text).toContain('The AI could not produce a usable card from this note.')
    expect(text).not.toContain('no_valid_items')
    expect(screen.getByTestId('knowledge-added-note-link-ks_1').getAttribute('href')).toBe('/knowledge-bit-review')
  })

  it('shows needs attention when the note finishes with no cards', async () => {
    mockedStatus.mockResolvedValue({ status: 'done', failureReason: null })
    mockedGroups.mockResolvedValue([])
    await addNote()
    await tick()

    expect(screen.getByTestId('knowledge-added-note-status-ks_1').textContent).toContain('found nothing')
  })

  it('keeps the form usable and the note queued when the status read fails', async () => {
    mockedStatus.mockRejectedValue(new Error('offline'))
    await addNote()
    await tick()

    expect(screen.getByTestId('knowledge-added-note-status-ks_1').textContent).toContain('Queued')
    expect(screen.getByTestId('knowledge-submit-button')).toBeTruthy()
  })
})
