// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { FetchStateBadge } from './fetch-state-badge'

afterEach(cleanup)

describe('FetchStateBadge', () => {
  it('renders a distinct label and data-state per fetch state', () => {
    render(<FetchStateBadge state="stale_failed" />)

    const badge = screen.getByTestId('fetch-state-badge')

    expect(badge.textContent).toBe('Fetch failed')
    expect(badge.dataset.state).toBe('stale_failed')
  })
})
