// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NotesBrowser } from './notes-browser'
import { pickSearchableOption, searchableValue } from '../ui/searchable-select-test-utils'

afterEach(cleanup)

const SUBJECTS = [{ id: 'subject-1', name: 'Web Development' }]

function renderBrowser(overrides: Partial<Parameters<typeof NotesBrowser>[0]> = {}) {
  const onSearch = vi.fn().mockResolvedValue({ ok: true, data: [] })
  const onLoadDomainMap = vi.fn().mockResolvedValue([])
  const onReview = vi.fn().mockResolvedValue({ ok: true, data: { note: null } })

  const { rerender } = render(
    <NotesBrowser
      subjects={SUBJECTS}
      onSearch={onSearch}
      onLoadDomainMap={onLoadDomainMap}
      onReview={onReview}
      {...overrides}
    />,
  )

  return {
    onSearch,
    onLoadDomainMap,
    onReview,
    rerenderWithSearch: (initialSearch: Parameters<typeof NotesBrowser>[0]['initialSearch']) =>
      rerender(
        <NotesBrowser
          subjects={SUBJECTS}
          onSearch={onSearch}
          onLoadDomainMap={onLoadDomainMap}
          onReview={onReview}
          {...overrides}
          initialSearch={initialSearch}
        />,
      ),
  }
}

describe('NotesBrowser', () => {
  it('should never fetch search results or review notes merely from landing on the page', () => {
    const { onSearch, onReview } = renderBrowser()

    expect(onSearch).not.toHaveBeenCalled()
    expect(onReview).not.toHaveBeenCalled()
  })

  it('should still not fetch a review note just from clicking into the review tab', () => {
    const { onReview } = renderBrowser()

    fireEvent.click(screen.getByTestId('notes-tab-review'))

    expect(onReview).not.toHaveBeenCalled()
    expect(screen.getByTestId('notes-review-start')).toBeTruthy()
  })

  it('should run a search only once the form is submitted with a query', async () => {
    const { onSearch } = renderBrowser()

    fireEvent.change(screen.getByTestId('notes-search-query'), {
      target: { value: 'idempotency' },
    })
    fireEvent.click(screen.getByTestId('notes-search-submit'))

    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        query: 'idempotency',
        concern: undefined,
        domainNodeId: undefined,
      }),
    )
  })

  it('should default to the search tab', () => {
    renderBrowser()

    expect(screen.getByTestId('notes-tab-search').getAttribute('aria-selected')).toBe(
      'true',
    )
  })

  it('should re-run the search from a bookmarked query without a second submit', async () => {
    const { onSearch } = renderBrowser({
      initialSearch: { tab: 'search', query: 'idempotency', concern: undefined, domainNodeId: undefined },
    })

    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        query: 'idempotency',
        concern: undefined,
        domainNodeId: undefined,
      }),
    )
    expect(screen.getByTestId('notes-search-query')).toHaveProperty('value', 'idempotency')
  })

  it('should report the searched query so the page URL can be bookmarked', async () => {
    const onSearchStateChange = vi.fn()

    renderBrowser({ onSearchStateChange })

    fireEvent.change(screen.getByTestId('notes-search-query'), {
      target: { value: 'idempotency' },
    })
    fireEvent.click(screen.getByTestId('notes-search-submit'))

    await waitFor(() =>
      expect(onSearchStateChange).toHaveBeenCalledWith({
        tab: 'search',
        query: 'idempotency',
        concern: undefined,
        domainNodeId: undefined,
        subjectId: undefined,
      }),
    )
  })

  it('should re-run the search when navigating to a different bookmarked URL while still mounted', async () => {
    const { onSearch, rerenderWithSearch } = renderBrowser({
      initialSearch: { tab: 'search', query: 'idempotency', concern: undefined, domainNodeId: undefined },
    })

    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        query: 'idempotency',
        concern: undefined,
        domainNodeId: undefined,
      }),
    )

    rerenderWithSearch({ tab: 'search', query: 'backoff', concern: undefined, domainNodeId: undefined })

    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        query: 'backoff',
        concern: undefined,
        domainNodeId: undefined,
      }),
    )
    expect(screen.getByTestId('notes-search-query')).toHaveProperty('value', 'backoff')
  })

  it('should show the shared link\'s area filter when opened from a URL with a subject', async () => {
    const onLoadDomainMap = vi.fn().mockResolvedValue([
      { id: 'node-1', name: 'Networking', order: 0, children: [] },
    ])

    renderBrowser({
      onLoadDomainMap,
      initialSearch: {
        tab: 'search',
        query: '',
        concern: undefined,
        domainNodeId: 'node-1',
        subjectId: 'subject-1',
      },
    })

    await waitFor(() => expect(onLoadDomainMap).toHaveBeenCalledWith('subject-1'))

    await waitFor(() =>
      expect(screen.getByTestId('notes-search-domain-node')).not.toHaveProperty('disabled', true),
    )
    expect(searchableValue('notes-search-domain-node')).toBe('Networking')
  })

  it('should not load the area dropdown when no subject is in the URL', () => {
    const { onLoadDomainMap } = renderBrowser()

    expect(onLoadDomainMap).not.toHaveBeenCalled()
  })

  it('should load the area dropdown when the subject is changed manually', async () => {
    const onLoadDomainMap = vi.fn().mockResolvedValue([])

    renderBrowser({ onLoadDomainMap })

    pickSearchableOption('notes-search-subject', 'subject-1')

    await waitFor(() => expect(onLoadDomainMap).toHaveBeenCalledWith('subject-1'))
  })

  it('should report the selected tab so switching tabs stays bookmarkable', () => {
    const onSearchStateChange = vi.fn()

    renderBrowser({ onSearchStateChange })

    fireEvent.click(screen.getByTestId('notes-tab-review'))

    expect(onSearchStateChange).toHaveBeenCalledWith({
      tab: 'review',
      query: '',
      concern: undefined,
      domainNodeId: undefined,
      subjectId: undefined,
    })
  })
})
