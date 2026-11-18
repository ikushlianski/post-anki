import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AnkiReviewCountsBand, reviewBandFractions } from './anki-review-counts-band'

describe('AnkiReviewCountsBand', () => {
  it('should size each segment by its share of the queue', () => {
    expect(reviewBandFractions({ new: 2, learning: 1, review: 1 })).toEqual({ new: 0.5, learning: 0.25, review: 0.25 })
  })

  it('should describe the counts in text for screen readers', () => {
    render(<AnkiReviewCountsBand counts={{ new: 2, learning: 1, review: 1 }} />)

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('1 due, 1 learning, 2 new')
  })

  it('should show an empty band when nothing is queued', () => {
    render(<AnkiReviewCountsBand counts={{ new: 0, learning: 0, review: 0 }} />)

    expect(reviewBandFractions({ new: 0, learning: 0, review: 0 })).toEqual({ new: 0, learning: 0, review: 0 })
    expect(screen.getByTestId('anki-review-counts-band').querySelector('[data-part="new"]')?.getAttribute('style')).toContain('0%')
  })
})
