import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { KnowledgeBitDetailCard } from '@post-anki/shared'

import { KnowledgeBrowserDetailCards } from './knowledge-browser-detail-cards'

const card = (over: Partial<KnowledgeBitDetailCard>): KnowledgeBitDetailCard => ({
  variantId: 'v1',
  cardKey: 'cloze:0',
  kind: 'cloze',
  order: 0,
  state: 'review',
  dueAt: null,
  lapses: 0,
  suspended: false,
  buried: false,
  ...over,
})

describe('KnowledgeBrowserDetailCards', () => {
  it('should list each gap of a cloze note with its own state and flags', () => {
    render(
      <KnowledgeBrowserDetailCards
        cards={[card({}), card({ variantId: 'v2', cardKey: 'cloze:1', order: 1, suspended: true, lapses: 2 })]}
      />,
    )

    const rows = screen.getAllByTestId('knowledge-browser-detail-card')

    expect(rows).toHaveLength(2)
    expect(rows[1]?.textContent).toContain('suspended')
    expect(rows[1]?.textContent).toContain('forgotten 2 times')
  })

  it('should show nothing for a basic note with a single note-level card', () => {
    render(<KnowledgeBrowserDetailCards cards={[card({ cardKey: '', kind: 'basic' })]} />)

    expect(screen.queryByTestId('knowledge-browser-detail-cards')).toBeNull()
  })
})
