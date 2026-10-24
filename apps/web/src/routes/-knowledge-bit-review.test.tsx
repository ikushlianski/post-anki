// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api')
vi.mock('../knowledge-source/failed-extractions.api', () => ({
  getFailedExtractions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  deleteFailedExtractions: vi.fn(),
}))

import { KnowledgeBitReviewLoadError } from '../knowledge-bit/knowledge-bit-review-load-error'
import { KnowledgeBitReviewLoading } from '../knowledge-bit/knowledge-bit-review-loading'
import { Route } from './knowledge-bit-review'

const config = Route as unknown as {
  pendingComponent: unknown
  errorComponent: unknown
}

describe('knowledge-bit-review route', () => {
  it('should show the loading screen while the list is being fetched', () => {
    expect(config.pendingComponent).toBe(KnowledgeBitReviewLoading)
  })

  it('should show the load error screen when fetching the list fails', () => {
    expect(config.errorComponent).toBe(KnowledgeBitReviewLoadError)
  })
})
