// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { KnowledgeBitReviewFlagBanner } from './knowledge-bit-review-flag-banner'

afterEach(cleanup)

describe('KnowledgeBitReviewFlagBanner', () => {
  it('should tell the reviewer a card needs manual review and why in plain words', () => {
    render(<KnowledgeBitReviewFlagBanner bitId="b1" reviewFlag="source_meta_reference" />)

    const banner = screen.getByTestId('knowledge-bit-review-flag-b1')

    expect(banner.textContent).toContain('Needs manual review')
    expect(banner.textContent).toContain('The card refers to the note itself instead of the content')
    expect(banner.textContent).not.toContain('source_meta_reference')
  })

  it('should fall back to a generic reason for a flag code it does not know', () => {
    render(<KnowledgeBitReviewFlagBanner bitId="b1" reviewFlag="brand_new_code" />)

    expect(screen.getByTestId('knowledge-bit-review-flag-b1').textContent).toContain(
      'The card needs a manual check before approval',
    )
  })

  it('should show nothing on a clean card', () => {
    render(<KnowledgeBitReviewFlagBanner bitId="b1" reviewFlag={null} />)

    expect(screen.queryByTestId('knowledge-bit-review-flag-b1')).toBeNull()
  })
})
