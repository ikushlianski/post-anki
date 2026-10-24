// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { KnowledgeBrowserPhrasings } from './knowledge-browser-phrasings'

afterEach(cleanup)

describe('KnowledgeBrowserPhrasings', () => {
  it('should show the main question first and every variation after it as plain text on one line', () => {
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
    expect(cards.map((card) => card.textContent)).toEqual([
      'What is a pod?',
      'A ___ runs containers',
      'Define a pod',
    ])
  })
})
