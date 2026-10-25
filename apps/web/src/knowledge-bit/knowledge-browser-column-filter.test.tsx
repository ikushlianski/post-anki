// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { KnowledgeBitBrowserFilters } from '@post-anki/shared'

import { KnowledgeBrowserColumnFilter } from './knowledge-browser-column-filter'
import type { BrowserFilterTarget } from './knowledge-browser-column-filter'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(column: BrowserFilterTarget, filters: KnowledgeBitBrowserFilters = {}) {
  const onChange = vi.fn()

  render(<KnowledgeBrowserColumnFilter column={column} filters={filters} onChange={onChange} />)

  return onChange
}

describe('KnowledgeBrowserColumnFilter', () => {
  it('should wait for typing to pause before filtering the question text', () => {
    vi.useFakeTimers()
    const onChange = setup('phrasings')

    fireEvent.change(screen.getByTestId('filter-question'), { target: { value: 'pod' } })
    act(() => vi.advanceTimersByTime(200))

    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(60))

    expect(onChange).toHaveBeenCalledWith({ question: 'pod' }, 'replace')
  })

  it('should keep other filters when the answer text changes', () => {
    vi.useFakeTimers()
    const onChange = setup('answer', { question: 'pod' })

    fireEvent.change(screen.getByTestId('filter-answer'), { target: { value: 'карточ' } })
    act(() => vi.advanceTimersByTime(300))

    expect(onChange).toHaveBeenCalledWith({ question: 'pod', answer: 'карточ' }, 'replace')
  })

  it('should show the typed text already set in the address', () => {
    setup('answer', { answer: 'abc' })

    expect((screen.getByTestId('filter-answer') as HTMLInputElement).value).toBe('abc')
  })

  it('should add a source type to the ones already ticked and untick it again', () => {
    const onChange = setup('source', { origins: ['article'] })

    fireEvent.click(screen.getByTestId('filter-origin-notion'))

    expect(onChange).toHaveBeenCalledWith({ origins: ['notion', 'article'] }, 'push')

    fireEvent.click(screen.getByTestId('filter-origin-article'))

    expect(onChange).toHaveBeenLastCalledWith({}, 'push')
  })

  it('should offer who added the piece and the study states', () => {
    const added = setup('addedBy')

    fireEvent.click(screen.getByTestId('filter-added-by-you'))

    expect(added).toHaveBeenCalledWith({ addedBy: ['you'] }, 'push')

    cleanup()

    const states = setup('state')

    fireEvent.click(screen.getByTestId('filter-state-buried'))

    expect(states).toHaveBeenCalledWith({ states: ['buried'] }, 'push')
    expect(screen.getAllByRole('checkbox')).toHaveLength(6)
  })

  it('should turn a typed web address into a bare site that implies a link', () => {
    vi.useFakeTimers()
    const onChange = setup('sourceUrl')

    fireEvent.change(screen.getByTestId('filter-site'), { target: { value: 'https://www.Wikipedia.org/wiki/X' } })
    act(() => vi.advanceTimersByTime(300))

    expect(onChange).toHaveBeenCalledWith({ link: 'has', site: 'wikipedia.org' }, 'replace')
  })

  it('should drop the site when the owner asks for pieces without a link', () => {
    const onChange = setup('sourceUrl', { link: 'has', site: 'wikipedia.org' })

    fireEvent.click(screen.getByTestId('filter-link-none'))

    expect(onChange).toHaveBeenCalledWith({ link: 'none' }, 'push')
  })

  it('should send a chosen day and warn when the range is reversed', () => {
    const onChange = setup('addedAt', { from: '2026-03-10', to: '2026-03-01' })

    expect(screen.getByTestId('filter-date-reversed')).toBeTruthy()

    fireEvent.change(screen.getByTestId('filter-to'), { target: { value: '2026-03-20' } })

    expect(onChange).toHaveBeenCalledWith({ from: '2026-03-10', to: '2026-03-20' }, 'push')
  })

  it('should show no warning for a valid range', () => {
    setup('addedAt', { from: '2026-03-01', to: '2026-03-10' })

    expect(screen.queryByTestId('filter-date-reversed')).toBeNull()
  })
})
