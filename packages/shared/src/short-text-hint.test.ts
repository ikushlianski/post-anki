import { describe, expect, it } from 'vitest'

import { SHORT_TEXT_HINT_THRESHOLD, isShortKnowledgeText } from './short-text-hint'

describe('isShortKnowledgeText', () => {
  it('should not warn when nothing was pasted', () => {
    expect(isShortKnowledgeText('')).toBe(false)
    expect(isShortKnowledgeText('   \n ')).toBe(false)
  })

  it('should warn for a one-character paste', () => {
    expect(isShortKnowledgeText('a')).toBe(true)
  })

  it('should warn just below the threshold and stop at the threshold', () => {
    expect(isShortKnowledgeText('a'.repeat(SHORT_TEXT_HINT_THRESHOLD - 1))).toBe(true)
    expect(isShortKnowledgeText('a'.repeat(SHORT_TEXT_HINT_THRESHOLD))).toBe(false)
  })

  it('should ignore surrounding whitespace when counting', () => {
    expect(isShortKnowledgeText(`  ${'a'.repeat(SHORT_TEXT_HINT_THRESHOLD)}  `)).toBe(false)
    expect(isShortKnowledgeText(`${' '.repeat(200)}short`)).toBe(true)
  })
})
