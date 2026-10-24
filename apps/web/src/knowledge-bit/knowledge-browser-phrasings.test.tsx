// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { KnowledgeBrowserPhrasings } from './knowledge-browser-phrasings'

afterEach(cleanup)

describe('KnowledgeBrowserPhrasings', () => {
  it('should show the main card first and label each variation by kind next to it', () => {
    render(
      <KnowledgeBrowserPhrasings
        phrasings={[
          { id: 'a', kind: 'basic', prompt: 'What is a pod?' },
          { id: 'b', kind: 'fill_in_the_blank', prompt: 'A ___ runs containers' },
          { id: 'c', kind: 'basic', prompt: 'Define a pod' },
        ]}
      />,
    )

    const cards = screen.getAllByTestId('knowledge-browser-phrasing')

    expect(cards.map((card) => card.getAttribute('data-role'))).toEqual(['main', 'variation', 'variation'])
    expect(cards[0].textContent).toBe('Main card: BasicWhat is a pod?')
    expect(cards[1].textContent).toContain('Variation: Fill in the gap')
    expect(cards[2].textContent).toContain('Variation: Reworded')
  })
})
