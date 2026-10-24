// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReviewCard } from '@post-anki/shared'

import { AnkiReviewCard } from './anki-review-card'

vi.mock('./knowledge-bit-chat-panel', () => ({
  KnowledgeBitChatPanel: () => null,
}))

afterEach(() => {
  cleanup()
})

const baseCard: ReviewCard = {
  variantId: 'v1',
  knowledgeBitId: 'kb1',
  kind: 'fill_in_the_blank',
  prompt: 'She ____ to the market.',
  answer: 'went',
  background: null,
  isAiGenerated: false,
  sourceLinks: [],
  phase: 'new',
  leech: false,
  intervalPreview: { again: 1, hard: 2, good: 3, easy: 4 },
}

describe('AnkiReviewCard', () => {
  it('should render [...]  in place of ____ before reveal for fill_in_the_blank', () => {
    render(<AnkiReviewCard card={baseCard} revealed={false} onReveal={() => {}} />)

    expect(screen.getByTestId('fill-blank-cloze').textContent).toBe('[...]')
    expect(screen.queryByTestId('fill-blank-answer')).toBeNull()
  })

  it('should show the answer word after reveal for fill_in_the_blank', () => {
    render(<AnkiReviewCard card={baseCard} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('fill-blank-answer').textContent).toBe('went')
  })

  it('should render basic card prompt as plain text without cloze markup', () => {
    const basicCard: ReviewCard = {
      ...baseCard,
      kind: 'basic',
      prompt: 'What does "went" mean?',
      answer: 'past tense of go',
    }

    render(<AnkiReviewCard card={basicCard} revealed={false} onReveal={() => {}} />)

    expect(screen.getByTestId('anki-review-prompt').textContent).toBe('What does "went" mean?')
    expect(screen.queryByTestId('fill-blank-cloze')).toBeNull()
  })

  it('should not show the AI badge or sources on a human-made card', () => {
    render(<AnkiReviewCard card={baseCard} revealed={false} onReveal={() => {}} />)

    expect(screen.queryByTestId('ai-label-badge')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Sources' })).toBeNull()
  })

  it('should show the AI badge with safe external source links on an AI card', () => {
    const aiCard: ReviewCard = {
      ...baseCard,
      isAiGenerated: true,
      sourceLinks: ['https://example.com/doc', 'javascript:alert(1)'],
    }

    render(<AnkiReviewCard card={aiCard} revealed={false} onReveal={() => {}} />)

    const link = screen.getByRole('link', { name: 'Source: example.com' })

    expect(screen.getByTestId('ai-label-badge')).toBeTruthy()
    expect(link.getAttribute('href')).toBe('https://example.com/doc')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('should show the AI badge without a sources list when an AI card has no links', () => {
    render(
      <AnkiReviewCard card={{ ...baseCard, isAiGenerated: true }} revealed={false} onReveal={() => {}} />,
    )

    expect(screen.getByTestId('ai-label-badge')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Sources' })).toBeNull()
  })

  it('should show the source link on a human-made card once the answer is revealed', () => {
    const card: ReviewCard = { ...baseCard, sourceLinks: ['https://example.com/doc'] }

    const { rerender } = render(<AnkiReviewCard card={card} revealed={false} onReveal={() => {}} />)

    expect(screen.queryByTestId('card-source-link')).toBeNull()

    rerender(<AnkiReviewCard card={card} revealed={true} onReveal={() => {}} />)

    const link = screen.getByTestId('card-source-link')

    expect(link.textContent).toBe('Source: example.com')
    expect(link.getAttribute('href')).toBe('https://example.com/doc')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByTestId('ai-label-badge')).toBeNull()
  })

  it('should not repeat the source link on a revealed AI card that already shows it in the badge', () => {
    const card: ReviewCard = { ...baseCard, isAiGenerated: true, sourceLinks: ['https://example.com/doc'] }

    render(<AnkiReviewCard card={card} revealed={true} onReveal={() => {}} />)

    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('should show no source link for a missing or unsafe address after reveal', () => {
    const { rerender } = render(<AnkiReviewCard card={baseCard} revealed={true} onReveal={() => {}} />)

    expect(screen.queryByTestId('card-source-link')).toBeNull()

    rerender(
      <AnkiReviewCard
        card={{ ...baseCard, sourceLinks: ['javascript:alert(1)', 'data:text/html,x'] }}
        revealed={true}
        onReveal={() => {}}
      />,
    )

    expect(screen.queryByTestId('card-source-link')).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
