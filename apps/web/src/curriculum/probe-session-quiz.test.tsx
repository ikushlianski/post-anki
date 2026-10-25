// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import type { ProbeSession } from '@post-anki/shared'

import { ProbeSessionQuiz, probeSessionQueryKey } from './probe-session-quiz'
import { answerProbeSession, getActiveProbeSession, prepareProbeSession } from './probe-session.api'

vi.mock('./probe-session.api', () => ({
  getActiveProbeSession: vi.fn(),
  prepareProbeSession: vi.fn(),
  answerProbeSession: vi.fn(),
}))

vi.mock('../feedback/item-feedback-buttons', () => ({
  ItemFeedbackButtons: () => null,
}))

const mockedGetActiveProbeSession = vi.mocked(getActiveProbeSession)
const mockedPrepareProbeSession = vi.mocked(prepareProbeSession)
const mockedAnswerProbeSession = vi.mocked(answerProbeSession)

const CURRICULUM_ID = 'curr-1'

function activeSession(): ProbeSession {
  return {
    id: 'sess-1',
    scope: 'curriculum',
    scopeId: CURRICULUM_ID,
    curriculumId: CURRICULUM_ID,
    mode: 'practice',
    status: 'active',
    total: 1,
    correct: 0,
    answered: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [
      {
        id: 'q1',
        order: 1,
        topicId: 't1',
        gapId: null,
        prompt: 'What is caching?',
        options: ['a', 'b'],
        difficulty: 'medium',
        format: 'mcq',
        type: 'single',
        answeredIndex: null,
        answeredIndexes: null,
        outcome: null,
        correctAnswerIndex: null,
        correctAnswerIndexes: null,
        optionExplanations: null,
      },
    ],
  }
}

function Observer() {
  const { data } = useQuery({
    queryKey: probeSessionQueryKey('curriculum', CURRICULUM_ID),
    queryFn: () => getActiveProbeSession({ data: { scope: 'curriculum', scopeId: CURRICULUM_ID } }),
    enabled: true,
  })

  return <p data-testid="observer-status">{data?.status ?? 'none'}</p>
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ProbeSessionQuiz scope="curriculum" scopeId={CURRICULUM_ID} />
      <Observer />
    </QueryClientProvider>,
  )
}

const TOPIC_ID = 'topic-1'

function topicSession(): ProbeSession {
  return {
    id: 'sess-topic-1',
    scope: 'topic',
    scopeId: TOPIC_ID,
    curriculumId: CURRICULUM_ID,
    mode: 'practice',
    status: 'active',
    total: 15,
    correct: 4,
    answered: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [
      {
        id: 'q1',
        order: 1,
        topicId: TOPIC_ID,
        gapId: null,
        prompt: 'What is caching?',
        options: ['a', 'b'],
        difficulty: 'medium',
        format: 'mcq',
        type: 'single',
        answeredIndex: null,
        answeredIndexes: null,
        outcome: null,
        correctAnswerIndex: null,
        correctAnswerIndexes: null,
        optionExplanations: null,
      },
    ],
  }
}

function renderTopicHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

  const view = render(
    <QueryClientProvider client={queryClient}>
      <ProbeSessionQuiz scope="topic" topicId={TOPIC_ID} />
    </QueryClientProvider>,
  )

  return { ...view, invalidateQueriesSpy }
}

describe('ProbeSessionQuiz sharing its cache with a sibling observer (curriculum scope)', () => {
  beforeEach(() => {
    mockedGetActiveProbeSession.mockReset()
    mockedPrepareProbeSession.mockReset()
    mockedAnswerProbeSession.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('reflects a completed one-shot session in a sibling observer, without a refetch wiping it back to none', async () => {
    mockedGetActiveProbeSession.mockResolvedValue(null)
    mockedPrepareProbeSession.mockResolvedValue(activeSession())
    mockedAnswerProbeSession.mockResolvedValue({
      questionId: 'q1',
      outcome: 'pass',
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 1,
      answered: 1,
      total: 1,
      status: 'completed',
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    })

    renderHarness()

    await waitFor(() => expect(screen.getByTestId('observer-status').textContent).toBe('none'))

    fireEvent.click(await screen.findByTestId('generate-quiz'))

    await waitFor(() => expect(screen.getByTestId('observer-status').textContent).toBe('active'))

    fireEvent.click(await screen.findByTestId('quiz-option-0'))

    await waitFor(() => expect(screen.getByTestId('observer-status').textContent).toBe('completed'))

    // getActiveProbeSession must only have been called once (the initial
    // shared fetch, deduped across both observers) — a curriculum-scoped
    // one-shot session must never trigger the refetch-on-low invalidate
    // that every other scope uses, since a refetch of a just-completed
    // session returns null (getActiveSessionRow only matches "active" or
    // "replenishing") and would wipe the session both components just saw.
    expect(mockedGetActiveProbeSession).toHaveBeenCalledTimes(1)
  })

  it('shows a short/long course recommendation once the calibration quiz completes', async () => {
    mockedGetActiveProbeSession.mockResolvedValue(null)
    mockedPrepareProbeSession.mockResolvedValue(activeSession())
    mockedAnswerProbeSession.mockResolvedValue({
      questionId: 'q1',
      outcome: 'pass',
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 1,
      answered: 1,
      total: 1,
      status: 'completed',
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: { recommendation: 'short', alreadyKnownRatio: 0.8 },
    })

    renderHarness()

    fireEvent.click(await screen.findByTestId('generate-quiz'))
    fireEvent.click(await screen.findByTestId('quiz-option-0'))
    fireEvent.click(await screen.findByTestId('quiz-next'))

    const notice = await screen.findByTestId('course-length-recommendation')
    expect(notice.textContent).toContain('already know most of this')
  })

  it('shows no course recommendation when the completing answer carries none', async () => {
    mockedGetActiveProbeSession.mockResolvedValue(null)
    mockedPrepareProbeSession.mockResolvedValue(activeSession())
    mockedAnswerProbeSession.mockResolvedValue({
      questionId: 'q1',
      outcome: 'pass',
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 1,
      answered: 1,
      total: 1,
      status: 'completed',
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    })

    renderHarness()

    fireEvent.click(await screen.findByTestId('generate-quiz'))
    fireEvent.click(await screen.findByTestId('quiz-option-0'))
    fireEvent.click(await screen.findByTestId('quiz-next'))

    await screen.findByTestId('quiz-complete')
    expect(screen.queryByTestId('course-length-recommendation')).toBeNull()
  })
})

// Issue #96, SCENARIO 4 (AC 17, 18, 19) — the client's own mirror of the
// server's early-mastery gate: once accuracy is clearly strong, submitting
// an answer that crosses the replenish floor must not also trigger a
// wasted refetch.
describe('ProbeSessionQuiz skipping the replenish refetch once mastery is shown (topic scope)', () => {
  beforeEach(() => {
    mockedGetActiveProbeSession.mockReset()
    mockedPrepareProbeSession.mockReset()
    mockedAnswerProbeSession.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not invalidate the probe-session query when the answer result crosses the replenish floor at 4/5 accuracy', async () => {
    mockedGetActiveProbeSession.mockResolvedValue(topicSession())
    mockedAnswerProbeSession.mockResolvedValue({
      questionId: 'q1',
      outcome: 'pass',
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 4,
      answered: 5,
      total: 15,
      status: 'active',
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    })

    const { invalidateQueriesSpy } = renderTopicHarness()

    fireEvent.click(await screen.findByTestId('quiz-option-0'))

    await screen.findByTestId('quiz-result', {}, { timeout: 5000 })

    expect(invalidateQueriesSpy).not.toHaveBeenCalled()
  })

  it('still invalidates the probe-session query when the same floor-crossing answer sits below the mastery threshold at 2/5 accuracy', async () => {
    mockedGetActiveProbeSession.mockResolvedValue(topicSession())
    mockedAnswerProbeSession.mockResolvedValue({
      questionId: 'q1',
      outcome: 'fail',
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 2,
      answered: 5,
      total: 15,
      status: 'active',
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    })

    const { invalidateQueriesSpy } = renderTopicHarness()

    fireEvent.click(await screen.findByTestId('quiz-option-0'))

    // Unlike the mastery case above, this invalidate triggers a real
    // background refetch (mocked getActiveProbeSession resolves again),
    // which can race ahead of and overwrite the just-applied optimistic
    // answer update — the same accepted staleness window the component's
    // own comments describe. Assert on the spy directly rather than on
    // quiz-result rendering, since that race is not what this test is
    // proving.
    await waitFor(() => expect(invalidateQueriesSpy).toHaveBeenCalled())
  })
})

describe('ProbeSessionQuiz option explanation citations', () => {
  beforeEach(() => {
    mockedGetActiveProbeSession.mockReset()
    mockedPrepareProbeSession.mockReset()
    mockedAnswerProbeSession.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('never turns an unsafe explanation citation url into a clickable href', async () => {
    mockedGetActiveProbeSession.mockResolvedValue(null)
    mockedPrepareProbeSession.mockResolvedValue(activeSession())
    mockedAnswerProbeSession.mockResolvedValue({
      questionId: 'q1',
      outcome: 'pass',
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 1,
      answered: 1,
      total: 1,
      status: 'active',
      coveredGapLabels: [],
      optionExplanations: [
        { text: 'because of the malicious source', citationUrl: 'javascript:alert(1)' },
        { text: 'not this one', citationUrl: null },
      ],
      gapMastery: null,
      courseLengthRecommendation: null,
    })

    renderHarness()

    fireEvent.click(await screen.findByTestId('generate-quiz'))
    fireEvent.click(await screen.findByTestId('quiz-option-0'))

    await screen.findByTestId('quiz-option-explanation-0')

    expect(screen.queryByTestId('quiz-option-citation-0')).toBeNull()
  })
})
