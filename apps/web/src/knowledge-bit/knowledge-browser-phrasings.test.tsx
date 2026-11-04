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

  it('should show the main question context above the question and nothing when there is none', () => {
    const { rerender } = render(
      <KnowledgeBrowserPhrasings phrasings={[{ id: 'a', kind: 'basic', prompt: 'What is a pod?', context: 'In Kubernetes' }]} />,
    )
    const context = screen.getByTestId('knowledge-browser-phrasing-context')
    const question = screen.getByTestId('knowledge-browser-phrasing')

    expect(context.textContent).toBe('In Kubernetes')
    expect(context.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    rerender(<KnowledgeBrowserPhrasings phrasings={[{ id: 'a', kind: 'basic', prompt: 'What is a pod?' }]} />)

    expect(screen.queryByTestId('knowledge-browser-phrasing-context')).toBeNull()
  })

  it('should keep a long question on one truncated line while the context line stays rendered above it', () => {
    render(
      <KnowledgeBrowserPhrasings
        phrasings={[
          {
            id: 'a',
            kind: 'basic',
            prompt: 'Explain in great detail how a pod scheduler decides placement across every node in the cluster',
            context: 'In Kubernetes',
          },
        ]}
      />,
    )
    const context = screen.getByTestId('knowledge-browser-phrasing-context')
    const question = screen.getByTestId('knowledge-browser-phrasing-question')

    expect(context.textContent).toBe('In Kubernetes')
    expect(question.classList).toContain('truncate')
    expect(context.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
