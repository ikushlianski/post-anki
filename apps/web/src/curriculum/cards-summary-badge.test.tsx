// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardsSummaryBadge } from './cards-summary-badge'

const getCurriculumCardsSummary = vi.fn()

vi.mock('./cards.api', () => ({
  getCurriculumCardsSummary: (...args: unknown[]) => getCurriculumCardsSummary(...args),
}))

describe('CardsSummaryBadge', () => {
  afterEach(cleanup)
  function renderBadge(curriculumId = 'cur_1') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    return render(
      <QueryClientProvider client={queryClient}>
        <CardsSummaryBadge curriculumId={curriculumId} />
      </QueryClientProvider>,
    )
  }

  it('renders nothing while nothing has been generated yet', async () => {
    getCurriculumCardsSummary.mockResolvedValue({ cardsReady: 0, topicsGenerating: 0 })

    const { container } = renderBadge()

    await waitFor(() => {
      expect(getCurriculumCardsSummary).toHaveBeenCalled()
    })

    expect(container.textContent).toBe('')
  })

  it('shows the ready count once cards exist', async () => {
    getCurriculumCardsSummary.mockResolvedValue({ cardsReady: 12, topicsGenerating: 0 })

    renderBadge()

    await waitFor(() => {
      expect(screen.getByTestId('cards-summary-badge').textContent).toContain(
        '12 cards ready so far',
      )
    })
  })

  it('shows the still-preparing state even before the first card is ready', async () => {
    getCurriculumCardsSummary.mockResolvedValue({ cardsReady: 0, topicsGenerating: 3 })

    renderBadge()

    await waitFor(() => {
      const text = screen.getByTestId('cards-summary-badge').textContent
      expect(text).toContain('0 cards ready so far')
      expect(text).toContain('still preparing 3 topics')
    })
  })

  it('mentions topics still being prepared alongside the ready count', async () => {
    getCurriculumCardsSummary.mockResolvedValue({ cardsReady: 4, topicsGenerating: 2 })

    renderBadge()

    await waitFor(() => {
      expect(screen.getByTestId('cards-summary-badge').textContent).toContain(
        'still preparing 2 topics',
      )
    })
  })

  it('uses singular wording for exactly one card and one topic', async () => {
    getCurriculumCardsSummary.mockResolvedValue({ cardsReady: 1, topicsGenerating: 1 })

    renderBadge()

    await waitFor(() => {
      const text = screen.getByTestId('cards-summary-badge').textContent
      expect(text).toContain('1 card ready so far')
      expect(text).toContain('still preparing 1 topic')
      expect(text).not.toContain('1 cards')
      expect(text).not.toContain('1 topics')
    })
  })
})
