// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { LibrarySource, SourceDuplicateSuggestion } from '@post-anki/shared'

import { DuplicateSuggestionList } from './duplicate-suggestion-list'

afterEach(cleanup)

function source(overrides: Partial<LibrarySource> & { id: string }): LibrarySource {
  return {
    curriculumId: 'c1',
    curriculumName: 'React',
    subjectId: 'subj1',
    subjectName: 'Web',
    kind: 'link',
    value: 'https://example.com',
    title: null,
    fetchState: 'fetched',
    lastFetchedAt: null,
    lastFetchOutcome: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function suggestion(overrides: Partial<SourceDuplicateSuggestion> = {}): SourceDuplicateSuggestion {
  return {
    id: 'sug1',
    sourceAId: 'a',
    sourceBId: 'b',
    similarity: null,
    matchKind: 'url_match',
    reason: 'Same normalized URL',
    status: 'pending',
    createdAt: '2026-08-01T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  }
}

describe('DuplicateSuggestionList', () => {
  it('never renders a merge or delete control anywhere', () => {
    render(
      <DuplicateSuggestionList
        suggestions={[suggestion()]}
        sources={[source({ id: 'a', title: 'A' }), source({ id: 'b', title: 'B' })]}
        onScan={vi.fn()}
        onScanned={vi.fn()}
        onResolve={vi.fn()}
        onResolved={vi.fn()}
      />,
    )

    expect(screen.queryByText(/merge/i)).toBeNull()
    expect(screen.queryByText(/delete/i)).toBeNull()
  })

  it('resolving a suggestion only sends a status change, not a merge target', async () => {
    const onResolve = vi.fn().mockResolvedValue({ ok: true, data: suggestion() })
    const onResolved = vi.fn()

    render(
      <DuplicateSuggestionList
        suggestions={[suggestion()]}
        sources={[source({ id: 'a' }), source({ id: 'b' })]}
        onScan={vi.fn()}
        onScanned={vi.fn()}
        onResolve={onResolve}
        onResolved={onResolved}
      />,
    )

    fireEvent.click(screen.getByTestId('duplicate-acknowledge'))

    await waitFor(() => expect(onResolved).toHaveBeenCalled())
    expect(onResolve).toHaveBeenCalledWith('sug1', { status: 'acknowledged' })
  })

  it('distinguishes a url_match from an embedding_similarity suggestion', () => {
    render(
      <DuplicateSuggestionList
        suggestions={[
          suggestion({ id: 's1', matchKind: 'url_match', similarity: null }),
          suggestion({ id: 's2', matchKind: 'embedding_similarity', similarity: 0.92 }),
        ]}
        sources={[source({ id: 'a' }), source({ id: 'b' })]}
        onScan={vi.fn()}
        onScanned={vi.fn()}
        onResolve={vi.fn()}
        onResolved={vi.fn()}
      />,
    )

    expect(screen.getByText('Same URL')).toBeTruthy()
    expect(screen.getByText('Similar content')).toBeTruthy()
    expect(screen.getByText('92% similar')).toBeTruthy()
  })

  it('triggers a scan and calls onScanned', async () => {
    const onScan = vi.fn().mockResolvedValue({ ok: true, data: {} })
    const onScanned = vi.fn()

    render(
      <DuplicateSuggestionList
        suggestions={[]}
        sources={[]}
        onScan={onScan}
        onScanned={onScanned}
        onResolve={vi.fn()}
        onResolved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('duplicate-scan-button'))

    await waitFor(() => expect(onScanned).toHaveBeenCalled())
    expect(onScan).toHaveBeenCalled()
  })
})
