// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeBrowserMeaningSearch, MEANING_MESSAGES } from './knowledge-browser-meaning-search'
import type { BrowserMatches } from './use-knowledge-browser-matches'

afterEach(cleanup)

function matchesOf(patch: Partial<BrowserMatches>): BrowserMatches {
  return {
    active: true,
    status: 'success',
    rows: [],
    readyCount: 5,
    notReadyCount: 0,
    capped: false,
    errorCode: null,
    retry: vi.fn(),
    ...patch,
  }
}

function renderSearch(patch: Partial<BrowserMatches> = {}, words: string | undefined = 'heart') {
  const onSearch = vi.fn()
  const matches = matchesOf(patch)

  render(<KnowledgeBrowserMeaningSearch words={words} matches={matches} onSearch={onSearch} />)

  return { onSearch, matches }
}

describe('KnowledgeBrowserMeaningSearch', () => {
  it('should not search while the owner is typing', () => {
    const { onSearch } = renderSearch({ active: false, status: 'off' }, undefined)

    fireEvent.change(screen.getByTestId('meaning-search-input'), { target: { value: 'how does the heart' } })

    expect(onSearch).not.toHaveBeenCalled()
  })

  it('should search when the owner presses Enter or the search button', () => {
    const { onSearch } = renderSearch({ active: false, status: 'off' }, undefined)

    fireEvent.change(screen.getByTestId('meaning-search-input'), { target: { value: '  how does the heart pump  ' } })
    fireEvent.submit(screen.getByTestId('meaning-search-form'))

    expect(onSearch).toHaveBeenCalledWith('how does the heart pump')
  })

  it('should leave meaning mode as soon as the box is emptied', () => {
    const { onSearch } = renderSearch()

    fireEvent.change(screen.getByTestId('meaning-search-input'), { target: { value: '' } })

    expect(onSearch).toHaveBeenCalledWith(undefined)
  })

  it('should show the words from the address in the box', () => {
    renderSearch()

    expect((screen.getByTestId('meaning-search-input') as HTMLInputElement).value).toBe('heart')
  })

  it('should tell how many matching pieces are not ready and are not included', () => {
    renderSearch({ notReadyCount: 4 })

    expect(screen.getByTestId('meaning-status-not-ready').textContent).toBe(
      '4 pieces are not ready for meaning search and are not included',
    )
  })

  it('should say when only the closest 100 are shown', () => {
    renderSearch({ capped: true })

    expect(screen.getByTestId('meaning-status-capped').textContent).toContain('closest 100')
  })

  it('should say nothing is close when ready pieces exist but none is near', () => {
    renderSearch({ readyCount: 8 })

    expect(screen.getByTestId('meaning-status-nothing-close').textContent).toBe(MEANING_MESSAGES.nothingClose)
  })

  it('should say no piece is ready when nothing in scope has meaning data', () => {
    renderSearch({ readyCount: 0, notReadyCount: 3 })

    expect(screen.getByTestId('meaning-status-nothing-ready').textContent).toBe(MEANING_MESSAGES.nothingReady)
    expect(screen.queryByTestId('meaning-status-not-ready')).toBeNull()
  })

  it('should say the search is paused until tomorrow when the daily limit is reached, without a retry', () => {
    renderSearch({ status: 'error', errorCode: 'llm_budget_exceeded' })

    expect(screen.getByTestId('meaning-status-error').textContent).toContain(MEANING_MESSAGES.budget)
    expect(screen.queryByTestId('meaning-retry')).toBeNull()
  })

  it('should ask to wait when searches come too fast, without a retry', () => {
    renderSearch({ status: 'error', errorCode: 'search_rate_limited' })

    expect(screen.getByTestId('meaning-status-error').textContent).toContain(MEANING_MESSAGES.rateLimited)
    expect(screen.queryByTestId('meaning-retry')).toBeNull()
  })

  it('should offer a retry only after a service failure', () => {
    const { matches } = renderSearch({ status: 'error', errorCode: 'embedding_failed' })

    expect(screen.getByTestId('meaning-status-error').textContent).toContain(MEANING_MESSAGES.failed)

    fireEvent.click(screen.getByTestId('meaning-retry'))

    expect(matches.retry).toHaveBeenCalledOnce()
  })

  it('should give an unknown failure a plain message without a retry', () => {
    renderSearch({ status: 'error', errorCode: 'boom' })

    expect(screen.getByTestId('meaning-status-error').textContent).toContain(MEANING_MESSAGES.unknown)
    expect(screen.queryByTestId('meaning-retry')).toBeNull()
  })

  it('should retry on a repeated Enter with the same words only after a refusal', () => {
    const { onSearch, matches } = renderSearch({ status: 'error', errorCode: 'search_rate_limited' })

    fireEvent.submit(screen.getByTestId('meaning-search-form'))

    expect(matches.retry).toHaveBeenCalledOnce()
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('should show that the search is running', () => {
    renderSearch({ status: 'pending' })

    expect(screen.getByTestId('meaning-status-searching')).toBeTruthy()
  })

  it('should ask for a valid date range instead of searching with a reversed one', () => {
    renderSearch({ status: 'blocked' })

    expect(screen.getByTestId('meaning-status-date-range').textContent).toBe(MEANING_MESSAGES.dateRange)
  })
})
