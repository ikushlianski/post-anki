// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { AiLabelBadge } from './ai-label-badge'
import { KnowledgeBitReviewItem } from './knowledge-bit-review-item'
import { threeVariantBit } from '../mocks/knowledge-bit-review.mock'

afterEach(cleanup)

describe('AiLabelBadge', () => {
  it('should show the AI badge and a safe link per source for an AI-generated item', () => {
    render(
      <AiLabelBadge
        isAiGenerated
        sourceLinks={['https://docs.example.com/guide', 'http://blog.example.org/post']}
      />,
    )

    expect(screen.getByText('AI')).toBeTruthy()

    const link = screen.getByRole('link', { name: 'Source: docs.example.com' })

    expect(link.textContent).toBe('docs.example.com')
    expect(link.getAttribute('href')).toBe('https://docs.example.com/guide')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('should show nothing for an item that is not AI-generated', () => {
    const { container } = render(
      <AiLabelBadge isAiGenerated={false} sourceLinks={['https://docs.example.com']} />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('should not render a non-http source as a link', () => {
    render(
      <AiLabelBadge
        isAiGenerated
        sourceLinks={['javascript:alert(1)', 'ftp://files.example.com/x', 'not a url']}
      />,
    )

    expect(screen.getByText('AI')).toBeTruthy()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('should show the badge with its sources on a review item for an AI-generated bit', () => {
    render(
      <ul>
        <KnowledgeBitReviewItem
          bit={{ ...threeVariantBit, isAiGenerated: true, sourceLinks: ['https://a.example.com/x'] }}
          isResolving={false}
          onApprove={() => {}}
          onReject={() => {}}
          onUndo={() => {}}
          onGrade={() => {}}
          onSaveVariant={async () => true}
          onSaveBit={async () => true}
        />
      </ul>,
    )

    expect(screen.getByTestId('ai-label-badge-bit-spacing')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Source: a.example.com' })).toBeTruthy()
  })

  it('should not show the badge on a review item for a regular bit', () => {
    render(
      <ul>
        <KnowledgeBitReviewItem
          bit={threeVariantBit}
          isResolving={false}
          onApprove={() => {}}
          onReject={() => {}}
          onUndo={() => {}}
          onGrade={() => {}}
          onSaveVariant={async () => true}
          onSaveBit={async () => true}
        />
      </ul>,
    )

    expect(screen.queryByTestId('ai-label-badge-bit-spacing')).toBeNull()
  })
})
