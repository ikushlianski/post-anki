// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Gap, GapMastery, Topic } from './model'
import { curateGap } from './curriculum.api'
import { GapChecklist, isGapActionable } from './topic-row'

const mockedCurateGap = vi.mocked(curateGap)

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => ({
  declareGap: vi.fn(),
  curateGap: vi.fn(),
  addTopicComment: vi.fn(),
  setTopicState: vi.fn(),
  updateModule: vi.fn(),
}))

function mastery(overrides: Partial<GapMastery> = {}): GapMastery {
  return {
    status: 'practicing',
    masteryStage: 1,
    correctCountInCycle: 1,
    incorrectCountInCycle: 0,
    ...overrides,
  }
}

function gap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: 'gap_1',
    topicId: 'topic_1',
    label: 'Understand connection pooling',
    status: 'open',
    depth: 'working',
    socratic: 'Why does pooling matter?',
    ...overrides,
  }
}

function topicWithGap(gapOverrides: Partial<Gap> = {}): Topic {
  return {
    id: 'topic_1',
    moduleId: 'mod_1',
    title: 'Connection management',
    order: 0,
    priority: 0,
    included: true,
    selfGrade: null,
    targetDepth: 'working',
    learningStatus: 'probing',
    gaps: [gap(gapOverrides)],
    progress: {
      status: 'in_progress',
      maturity: 40,
      gapsTotal: 1,
      gapsCovered: 0,
      attempts: 1,
      lastInteractedAt: null,
    },
    depthElectedAt: null,
    headroomOfferedAt: null,
  }
}

function renderChecklist(topic: Topic) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <GapChecklist topic={topic} curriculumId="cur_1" hydrated />
    </QueryClientProvider>,
  )
}

describe('isGapActionable', () => {
  it('is actionable when a gap is open with no mastery record at all', () => {
    expect(isGapActionable({ status: 'open' })).toBe(true)
  })

  it.each(['new', 'practicing', 'struggling'] as const)(
    'stays actionable for an open gap being actively tracked at mastery status %s',
    (status) => {
      expect(isGapActionable({ status: 'open', mastery: mastery({ status }) })).toBe(true)
    },
  )

  it('is actionable for an open gap even if its mastery record already reads mastered', () => {
    expect(isGapActionable({ status: 'open', mastery: mastery({ status: 'mastered' }) })).toBe(true)
  })

  it('is not actionable once a gap is covered, regardless of its mastery record', () => {
    expect(isGapActionable({ status: 'covered', mastery: mastery({ status: 'mastered' }) })).toBe(false)
    expect(isGapActionable({ status: 'covered' })).toBe(false)
  })

  it('is not actionable once a gap is skipped', () => {
    expect(isGapActionable({ status: 'skipped' })).toBe(false)
  })
})

describe('GapChecklist gap controls', () => {
  afterEach(() => {
    cleanup()
    mockedCurateGap.mockReset()
  })

  it('lets a learner stop showing a gap they have already been quizzed on', async () => {
    mockedCurateGap.mockResolvedValue(null)
    renderChecklist(topicWithGap({ status: 'open', mastery: mastery({ status: 'practicing' }) }))

    const row = screen.getByTestId('gap-row-gap_1')
    const wantButton = within(row).getByRole('button', { name: '☆ want' })
    const skipButton = within(row).getByRole('button', { name: 'skip' })

    expect(wantButton.hasAttribute('disabled')).toBe(false)
    expect(skipButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(skipButton)

    await waitFor(() =>
      expect(mockedCurateGap).toHaveBeenCalledWith({
        data: { gapId: 'gap_1', wanted: undefined, status: 'skipped' },
      }),
    )
  })

  it('hides the want/skip controls for an already-mastered gap and keeps the status badge', () => {
    renderChecklist(topicWithGap({ status: 'covered', mastery: mastery({ status: 'mastered' }) }))

    const row = screen.getByTestId('gap-row-gap_1')

    expect(within(row).queryByRole('button', { name: /want/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'skip' })).toBeNull()
    expect(screen.getByTestId('gap-mastery-status-gap_1')).toBeTruthy()
  })
})
