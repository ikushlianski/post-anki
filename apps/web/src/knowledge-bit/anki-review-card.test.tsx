// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('AnkiReviewCard cloze', () => {
  const cloze: ReviewCard = {
    ...baseCard,
    kind: 'cloze',
    prompt: 'A deal needs budget, ____ (hint: who signs) and need.',
    answer: 'authority',
  }

  it('should show the blank with its hint before reveal', () => {
    render(<AnkiReviewCard card={cloze} revealed={false} onReveal={() => {}} />)

    expect(screen.getByTestId('fill-blank-cloze').textContent).toBe('[...]')
    expect(screen.getByTestId('anki-review-prompt').textContent).toContain('(hint: who signs)')
  })

  it('should hide the blank hint when the subject turned hinting off', () => {
    render(<AnkiReviewCard card={cloze} revealed={false} onReveal={() => {}} hintingEnabled={false} />)

    expect(screen.getByTestId('anki-review-prompt').textContent).not.toContain('hint')
  })

  it('should show the filled sentence with the answer bold and without the hint after reveal', () => {
    render(<AnkiReviewCard card={cloze} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('fill-blank-answer').textContent).toBe('authority')
    expect(screen.getByTestId('anki-review-answer').textContent).toBe('A deal needs budget, authority and need.')
  })
})

describe('AnkiReviewCard ordered list', () => {
  const next: ReviewCard = {
    ...baseCard,
    kind: 'list_next',
    prompt: 'Closing a sale: after "Pitch" the next step is ____',
    answer: 'Negotiate',
  }
  const overview: ReviewCard = {
    ...baseCard,
    kind: 'list_overview',
    prompt: 'How many steps are in Closing a sale? Name them in order.',
    answer: '3 steps\n1. Qualify\n2. Pitch\n3. Close',
  }

  it('should show a blank on the next-step card and the filled step bold after reveal', () => {
    const { unmount } = render(<AnkiReviewCard card={next} revealed={false} onReveal={() => {}} />)

    expect(screen.getByTestId('fill-blank-cloze').textContent).toBe('[...]')
    unmount()
    render(<AnkiReviewCard card={next} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('fill-blank-answer').textContent).toBe('Negotiate')
  })

  it('should reveal the count and the numbered list on the overview card', () => {
    render(<AnkiReviewCard card={overview} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('anki-review-answer').textContent).toBe('3 steps\n1. Qualify\n2. Pitch\n3. Close')
    expect(screen.getByTestId('anki-review-answer').className).toContain('whitespace-pre-line')
  })

  it('should keep line breaks in a question and break a very long unbroken token', () => {
    const basicCard: ReviewCard = { ...baseCard, kind: 'basic', prompt: `line one\nline two ${'x'.repeat(300)}` }

    render(<AnkiReviewCard card={basicCard} revealed={false} onReveal={() => {}} />)

    const prompt = screen.getByTestId('anki-review-prompt')

    expect(prompt.className).toContain('whitespace-pre-line')
    expect(prompt.className).toContain('break-words')
    expect(prompt.textContent).toContain('line one\nline two')
  })

  it('should show the AI-suggested phrase beside the original only after reveal', () => {
    const card: ReviewCard = { ...baseCard, kind: 'basic', answer: 'touch the base', aiSuggestion: 'touch base' }
    const { rerender } = render(<AnkiReviewCard card={card} revealed={false} onReveal={() => {}} />)

    expect(screen.queryByTestId('ai-suggestion-text')).toBeNull()

    rerender(<AnkiReviewCard card={card} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('ai-suggestion-text').textContent).toBe('touch base')
    expect(screen.getByTestId('ai-suggestion-original').textContent).toBe('touch the base')
  })

  it('should label the phrase the user wrote, not the AI-preferred chunk, as the original', () => {
    const card: ReviewCard = {
      ...baseCard,
      kind: 'basic',
      answer: 'wrap things up',
      aiSuggestion: 'wrap things up',
      originalPhrase: 'wrap it up',
    }

    render(<AnkiReviewCard card={card} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('ai-suggestion-original').textContent).toBe('wrap it up')
  })

  it('should show the context as a small line above the question', () => {
    render(
      <AnkiReviewCard
        card={{ ...baseCard, kind: 'basic', prompt: 'Formal moment', context: 'senior dev talking to their manager' }}
        revealed={false}
        onReveal={() => {}}
      />,
    )

    const context = screen.getByTestId('anki-review-context')

    expect(context.textContent).toBe('senior dev talking to their manager')
    expect(context.compareDocumentPosition(screen.getByTestId('anki-review-prompt'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('should show no context line when the card has none', () => {
    render(<AnkiReviewCard card={baseCard} revealed={false} onReveal={() => {}} />)

    expect(screen.queryByTestId('anki-review-context')).toBeNull()
  })

  it('should copy the question, answer and background together with Copy all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <AnkiReviewCard card={{ ...baseCard, background: 'Past tense' }} revealed={true} onReveal={() => {}} />,
    )
    fireEvent.click(screen.getByTestId('anki-review-copy-all'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('She ____ to the market.\n\nwent\n\nPast tense'))
  })
})
