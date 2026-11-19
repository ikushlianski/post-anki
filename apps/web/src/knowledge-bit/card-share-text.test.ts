import { describe, expect, it } from 'vitest'
import type { ReviewCard } from '@post-anki/shared'

import { cardShareText } from './card-share-text'

function card(overrides: Partial<ReviewCard>): ReviewCard {
  return { variantId: 'v-1', kind: 'qa', prompt: 'Capital of France?', answer: 'Paris', background: 'private note', ...overrides } as ReviewCard
}

describe('card share text', () => {
  it('should share only the question and answer without ids or notes', () => {
    expect(cardShareText(card({}))).toBe('Q: Capital of France?\nA: Paris')
  })

  it('should drop the hint and fill the blank in the shared answer', () => {
    const text = cardShareText(card({ kind: 'fill_in_the_blank', prompt: 'Budget, ____ (hint: who signs) and need.', answer: 'authority' }))

    expect(text).toBe('Q: Budget, ____ and need.\nA: Budget, authority and need.')
  })

  it('should fill every gap of a multi-gap card from the separated answers', () => {
    const text = cardShareText(card({ kind: 'fill_in_the_blank', prompt: '____ runs on port ____', answer: 'HTTPS / 443' }))

    expect(text).toBe('Q: ____ runs on port ____\nA: HTTPS runs on port 443')
  })
})
