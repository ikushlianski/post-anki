// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'

import { listOpenQuestions } from './open-questions.api'
import { OpenQuestionsList } from './open-questions-list'

vi.mock('./open-questions.api')

afterEach(cleanup)

describe('OpenQuestionsList phone targets', () => {
  it('should give filter tabs, answer box and actions a 44px phone size', async () => {
    vi.mocked(listOpenQuestions).mockResolvedValue({
      items: [
        {
          id: 'oq1',
          sourceType: 'probe_question',
          sourceItemId: 'q1',
          topicId: null,
          topicTitle: null,
          questionText: 'Why?',
          status: 'open',
          answerText: null,
          createdAt: '2026-10-01T00:00:00Z',
          resolvedAt: null,
        },
      ],
    } as never)

    render(
      <QueryClientProvider client={new QueryClient()}>
        <OpenQuestionsList />
      </QueryClientProvider>,
    )

    expect((await screen.findByTestId('open-question-answer-input-oq1')).className).toContain('min-h-[44px]')
    expect(screen.getByTestId('open-questions-filter-open').className).toContain('min-h-[44px]')
    expect(screen.getByTestId('open-question-answer-submit-oq1').className).toContain('min-h-[44px]')
    expect(screen.getByTestId('open-question-dismiss-oq1').className).toContain('min-h-[44px]')
  })
})
