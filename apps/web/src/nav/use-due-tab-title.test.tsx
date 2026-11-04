// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { dueTabTitle, useDueTabTitle } from './use-due-tab-title'

afterEach(cleanup)

describe('useDueTabTitle', () => {
  it('should show the number of due cards in the tab title and restore it when none are due', () => {
    const { rerender } = renderHook(({ due }) => useDueTabTitle(due), { initialProps: { due: 5 as number | null } })

    expect(document.title).toBe('(5) Post Anki')

    rerender({ due: 0 })

    expect(document.title).toBe('Post Anki')
  })

  it('should leave the title alone until the count is known', () => {
    document.title = 'Post Anki'
    renderHook(() => useDueTabTitle(null))

    expect(document.title).toBe('Post Anki')
    expect(dueTabTitle(null)).toBe('Post Anki')
  })

  it('should keep the page name and add only the count', () => {
    expect(dueTabTitle(3, 'Inbox · Post Anki')).toBe('(3) Inbox · Post Anki')
    expect(dueTabTitle(3, '(7) Inbox · Post Anki')).toBe('(3) Inbox · Post Anki')
    expect(dueTabTitle(0, '(7) Inbox · Post Anki')).toBe('Inbox · Post Anki')
  })

  it('should re-add the count after navigation sets a new page title', async () => {
    document.title = 'Stats · Post Anki'
    renderHook(() => useDueTabTitle(4))

    expect(document.title).toBe('(4) Stats · Post Anki')

    await act(async () => {
      document.title = 'Inbox · Post Anki'
      await Promise.resolve()
    })

    expect(document.title).toBe('(4) Inbox · Post Anki')
  })

  it('should drop the count prefix when the count goes back to unknown', () => {
    document.title = 'Inbox · Post Anki'

    const { rerender } = renderHook(({ due }) => useDueTabTitle(due), { initialProps: { due: 4 as number | null } })

    expect(document.title).toBe('(4) Inbox · Post Anki')

    rerender({ due: null })

    expect(document.title).toBe('Inbox · Post Anki')
  })
})
