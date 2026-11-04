// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { CardContextLine } from './card-context-line'

afterEach(cleanup)

describe('CardContextLine', () => {
  it('should show the situation text when a card has one', () => {
    render(<CardContextLine context="At a restaurant" />)

    expect(screen.getByTestId('card-context-line').textContent).toBe('At a restaurant')
  })

  it('should show nothing for a card without context', () => {
    const { container } = render(<CardContextLine context="   " />)

    expect(container.firstChild).toBeNull()
  })
})
