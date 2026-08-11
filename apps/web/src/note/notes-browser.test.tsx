// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NotesBrowser } from './notes-browser'

afterEach(cleanup)

const SUBJECTS = [{ id: 'subject-1', name: 'Web Development' }]

function renderBrowser(overrides: Partial<Parameters<typeof NotesBrowser>[0]> = {}) {
  const onSearch = vi.fn().mockResolvedValue({ ok: true, data: [] })
  const onLoadDomainMap = vi.fn().mockResolvedValue([])
  const onReview = vi.fn().mockResolvedValue({ ok: true, data: { note: null } })

  render(
    <NotesBrowser
      subjects={SUBJECTS}
      onSearch={onSearch}
      onLoadDomainMap={onLoadDomainMap}
      onReview={onReview}
      {...overrides}
    />,
  )

  return { onSearch, onLoadDomainMap, onReview }
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
})
