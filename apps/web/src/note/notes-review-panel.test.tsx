// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NotesReviewPanel } from './notes-review-panel'

afterEach(cleanup)

const NOTE = {
  id: 'note-1',
  nodeType: 'topic' as const,
  nodeId: 'topic-1',
  body: 'idempotency means repeatable without side effects',
  isHighlight: false,
  concern: null,
  lastSurfacedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('NotesReviewPanel', () => {
  it('should never call onReview merely from rendering', () => {
    const onReview = vi.fn()
    render(<NotesReviewPanel onReview={onReview} />)

    expect(onReview).not.toHaveBeenCalled()
  })

  it('should fetch and show exactly one note only after the user clicks', async () => {
    const onReview = vi.fn().mockResolvedValue({ ok: true, data: { note: NOTE } })
    render(<NotesReviewPanel onReview={onReview} />)

    fireEvent.click(screen.getByTestId('notes-review-start'))

    await waitFor(() => expect(onReview).toHaveBeenCalledWith([]))
    expect((await screen.findByTestId('notes-review-note')).textContent).toContain(
      NOTE.body,
    )
  })

  it('should exclude previously shown notes when reading another, without persisting past unmount', async () => {
    const onReview = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { note: NOTE } })
      .mockResolvedValueOnce({
        ok: true,
        data: { note: { ...NOTE, id: 'note-2', body: 'a second note' } },
      })
    const { unmount } = render(<NotesReviewPanel onReview={onReview} />)

    fireEvent.click(screen.getByTestId('notes-review-start'))
    await screen.findByTestId('notes-review-note')

    fireEvent.click(screen.getByTestId('notes-review-another'))
    await waitFor(() => expect(onReview).toHaveBeenLastCalledWith(['note-1']))

    unmount()

    const freshOnReview = vi.fn().mockResolvedValue({ ok: true, data: { note: NOTE } })
    render(<NotesReviewPanel onReview={freshOnReview} />)
    fireEvent.click(screen.getByTestId('notes-review-start'))

    await waitFor(() => expect(freshOnReview).toHaveBeenCalledWith([]))
  })

  it('should show an honest empty state rather than a counter when nothing is left', async () => {
    const onReview = vi.fn().mockResolvedValue({ ok: true, data: { note: null } })
    render(<NotesReviewPanel onReview={onReview} />)

    fireEvent.click(screen.getByTestId('notes-review-start'))

    expect(await screen.findByTestId('notes-review-empty')).toBeTruthy()
  })

  it('should never render any badge, counter, or "remaining" text', async () => {
    const onReview = vi.fn().mockResolvedValue({ ok: true, data: { note: NOTE } })
    const { container } = render(<NotesReviewPanel onReview={onReview} />)

    fireEvent.click(screen.getByTestId('notes-review-start'))
    await screen.findByTestId('notes-review-note')

    expect(container.textContent).not.toMatch(/\d+\s*(notes?|left|remaining|to review)/i)
  })
})
