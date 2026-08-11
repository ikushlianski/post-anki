// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { LibrarySource } from '@post-anki/shared'

import { LibraryBrowser } from './library-browser'

afterEach(cleanup)

function source(overrides: Partial<LibrarySource> & { id: string }): LibrarySource {
  return {
    curriculumId: 'c1',
    curriculumName: 'React',
    subjectId: 'subj1',
    subjectName: 'Web',
    kind: 'link',
    value: 'https://example.com',
    title: 'React docs',
    fetchState: 'fetched',
    lastFetchedAt: null,
    lastFetchOutcome: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('LibraryBrowser', () => {
  it('shows a neutral empty state when nothing has been captured', () => {
    render(<LibraryBrowser sources={[]} onRefetch={vi.fn()} onRefetched={vi.fn()} />)

    expect(screen.getByTestId('library-browser-empty')).toBeTruthy()
  })

  it('lists every source with its provenance and fetch state', () => {
    render(
      <LibraryBrowser
        sources={[source({ id: 'a' }), source({ id: 'b', title: 'Vue docs' })]}
        onRefetch={vi.fn()}
        onRefetched={vi.fn()}
      />,
    )

    expect(screen.getAllByTestId('library-source-row')).toHaveLength(2)
    expect(screen.getByText('React docs')).toBeTruthy()
    expect(screen.getByText('Vue docs')).toBeTruthy()
  })

  it('never renders a merge or delete control for any source', () => {
    render(
      <LibraryBrowser sources={[source({ id: 'a' })]} onRefetch={vi.fn()} onRefetched={vi.fn()} />,
    )

    expect(screen.queryByText(/merge/i)).toBeNull()
    expect(screen.queryByText(/delete/i)).toBeNull()
  })

  it('only offers re-fetch for link-kind sources', () => {
    render(
      <LibraryBrowser
        sources={[source({ id: 'a', kind: 'link' }), source({ id: 'b', kind: 'text' })]}
        onRefetch={vi.fn()}
        onRefetched={vi.fn()}
      />,
    )

    expect(screen.getAllByTestId('library-refetch-button')).toHaveLength(1)
  })

  it('calls onRefetch and onRefetched when the re-fetch button is clicked', async () => {
    const onRefetch = vi.fn().mockResolvedValue({ ok: true, data: {} })
    const onRefetched = vi.fn()

    render(
      <LibraryBrowser sources={[source({ id: 'a' })]} onRefetch={onRefetch} onRefetched={onRefetched} />,
    )

    fireEvent.click(screen.getByTestId('library-refetch-button'))

    await waitFor(() => expect(onRefetched).toHaveBeenCalled())
    expect(onRefetch).toHaveBeenCalledWith('a')
  })
})
