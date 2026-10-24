// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href="#" data-to={to} {...rest}>
      {children}
    </a>
  ),
}))

import { OPEN_GLOBAL_CARD_CHAT_EVENT } from '../global-card-chat/global-card-chat-events'
import { HomeOptions } from './home-options'

afterEach(cleanup)

describe('HomeOptions', () => {
  it('should let the learner start a review with one click', () => {
    render(<HomeOptions />)

    expect(screen.getByTestId('home-start-review').getAttribute('data-to')).toBe('/knowledge/review')
  })

  it('should put the cursor in the header search when the learner wants to search subjects', () => {
    render(
      <>
        <input data-testid="global-search-input" />
        <HomeOptions />
      </>,
    )

    fireEvent.click(screen.getByTestId('home-search-subjects'))

    expect(document.activeElement).toBe(screen.getByTestId('global-search-input'))
  })

  it('should open the card chat when the learner chooses to chat with a subject', () => {
    const opened = vi.fn()

    window.addEventListener(OPEN_GLOBAL_CARD_CHAT_EVENT, opened)
    render(<HomeOptions />)

    fireEvent.click(screen.getByTestId('home-chat-with-subject'))
    window.removeEventListener(OPEN_GLOBAL_CARD_CHAT_EVENT, opened)

    expect(opened).toHaveBeenCalledTimes(1)
  })
})
