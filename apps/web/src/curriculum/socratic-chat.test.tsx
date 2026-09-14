// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SocraticChat } from './socratic-chat'
import { startSocraticSession } from './socratic.api'

vi.mock('./socratic.api', () => ({
  startSocraticSession: vi.fn(),
  answerSocraticSession: vi.fn(),
}))

vi.mock('../feedback/item-feedback-buttons', () => ({
  ItemFeedbackButtons: () => null,
}))

vi.mock('../open-questions/capture-question-button', () => ({
  CaptureQuestionButton: () => null,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    'data-testid': testId,
    className,
  }: {
    to: string
    params: Record<string, string>
    children: ReactNode
    'data-testid': string
    className?: string
  }) => (
    <a href={to} data-testid={testId} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({
    invalidate: vi.fn().mockResolvedValue(undefined),
  }),
}))

const mockedStartSocraticSession = vi.mocked(startSocraticSession)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderHarness(topicId: string, curriculumId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SocraticChat topicId={topicId} curriculumId={curriculumId} />
    </QueryClientProvider>,
  )
}

describe('SocraticChat', () => {
  it('links a blocked calibration screen to that course’s calibration quiz', async () => {
    mockedStartSocraticSession.mockResolvedValue({ ok: false, code: 'calibration_required' })

    renderHarness('topic-1', 'curr-1')

    const link = await waitFor(() =>
      screen.getByTestId('socratic-calibration-required-link'),
    )

    expect(link.getAttribute('href')).toBe('/curriculum/$curriculumId/assess')
    expect(JSON.parse(link.getAttribute('data-params') ?? '{}')).toEqual({
      curriculumId: 'curr-1',
    })
  })
})
