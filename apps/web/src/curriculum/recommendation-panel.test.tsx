// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TopicRecommendation } from '@post-anki/shared'

import { RecommendationPanel } from './recommendation-panel'

vi.mock('./stats.api', () => ({
  generateRecommendations: vi.fn(),
}))

function recommendation(overrides: Partial<TopicRecommendation> = {}): TopicRecommendation {
  return {
    topicId: 'top_1',
    text: 'Read up on this before your next session.',
    citations: ['https://example.com/a'],
    generatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPanel(recommendations: TopicRecommendation[]) {
  const client = new QueryClient()

  return render(
    <QueryClientProvider client={client}>
      <RecommendationPanel
        curriculumId="cur_1"
        eligible
        recommendations={recommendations}
        onGenerated={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('RecommendationPanel.citationLinks', () => {
  afterEach(cleanup)

  it('never turns an unsafe citation url into a clickable href', () => {
    renderPanel([recommendation({ citations: ['javascript:alert(1)'] })])

    const item = screen.getByTestId('recommendation-item')

    expect(item.querySelector('a')).toBeNull()
  })

  it('keeps a genuinely safe citation url clickable', () => {
    renderPanel([recommendation({ citations: ['https://example.com/a'] })])

    const link = screen.getByTestId('recommendation-item').querySelector('a')

    expect(link?.getAttribute('href')).toBe('https://example.com/a')
  })
})
