import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { KnowledgeBitReviewSourceSummary } from './knowledge-bit-review-source-summary'

describe('KnowledgeBitReviewSourceSummary', () => {
  it('should show the article summary so the reviewer sees what the items came from', () => {
    render(
      <KnowledgeBitReviewSourceSummary sourceId="s1" summary="A short recap." sourceUrl={null} />,
    )

    expect(screen.getByText('Article summary')).toBeTruthy()
    expect(screen.getByText('A short recap.')).toBeTruthy()
  })

  it('should link to the original article safely in a new tab', () => {
    render(
      <KnowledgeBitReviewSourceSummary
        sourceId="s1"
        summary="Recap"
        sourceUrl="https://example.com/post"
      />,
    )

    const link = screen.getByRole('link', { name: 'example.com' })

    expect(link.getAttribute('href')).toBe('https://example.com/post')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('should not render a link for a non-http source url', () => {
    render(
      <KnowledgeBitReviewSourceSummary
        sourceId="s1"
        summary="Recap"
        sourceUrl="javascript:alert(1)"
      />,
    )

    expect(screen.queryByRole('link')).toBeNull()
  })

  it('should show nothing when the source has no summary', () => {
    const { container } = render(
      <KnowledgeBitReviewSourceSummary
        sourceId="s1"
        summary={null}
        sourceUrl="https://example.com"
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('should render HTML-like summary text as plain text', () => {
    const { container } = render(
      <KnowledgeBitReviewSourceSummary
        sourceId="s1"
        summary={'<img src=x onerror=alert(1)><b>bold</b>'}
        sourceUrl={null}
      />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)><b>bold</b>')).toBeTruthy()
  })
})
