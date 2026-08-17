// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { LearningPath, LearningPathStep, PathProgress } from '@post-anki/shared'

vi.mock('../curriculum/probe-answer', () => ({
  ProbeAnswer: () => <div data-testid="mock-probe-answer" />,
}))

import { LearningPathDetail } from './learning-path-detail'
import type { ApiResult, StepPushResult } from './learning-path.model'

afterEach(cleanup)

function path(overrides: Partial<LearningPath>): LearningPath {
  return {
    id: 'path-1',
    name: 'Frontend Engineer',
    targetRoleLabel: 'Frontend Engineer',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: '2026-08-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

function step(overrides: Partial<LearningPathStep>): LearningPathStep {
  return {
    id: 'step-a',
    pathId: 'path-1',
    domainNodeId: 'node-a',
    order: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const baseTemplates = [
  {
    id: 'frontend-engineer',
    name: 'Frontend Engineer',
    targetRoleLabel: 'Frontend Engineer',
    targets: [
      { domainNodeId: 'node-a', name: 'React Hooks' },
      { domainNodeId: 'node-b', name: 'React State Management' },
    ],
  },
]

type LoadStepPushMock = ReturnType<
  typeof vi.fn<(stepDomainNodeId: string) => Promise<ApiResult<StepPushResult>>>
>

function renderDetail(overrides: {
  progress?: PathProgress
  nextStepDomainNodeId?: string | null
  onLoadStepPush?: LoadStepPushMock
} = {}) {
  const onLoadStepPush: LoadStepPushMock =
    overrides.onLoadStepPush ??
    vi.fn<(stepDomainNodeId: string) => Promise<ApiResult<StepPushResult>>>().mockResolvedValue({
      ok: true,
      data: { push: null, question: null },
    })

  const progress: PathProgress = overrides.progress ?? {
    overallStatus: 'in_progress',
    steps: [
      {
        domainNodeId: 'node-a',
        status: 'not_started',
        progress: { topicsIncluded: 4, topicsMastered: 0, percent: 0 },
      },
      {
        domainNodeId: 'node-b',
        status: 'not_started',
        progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
      },
    ],
  }

  render(
    <LearningPathDetail
      path={path({})}
      steps={[step({ domainNodeId: 'node-a', order: 0 }), step({ domainNodeId: 'node-b', order: 1 })]}
      progress={progress}
      nextStepDomainNodeId={overrides.nextStepDomainNodeId ?? 'node-a'}
      templates={baseTemplates}
      subjects={[{ id: 'subject-1', name: 'Web Development' }]}
      onLoadStepPush={onLoadStepPush}
      onAbandon={vi.fn()}
      onAbandoned={vi.fn()}
      onCapture={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      onCaptured={vi.fn()}
    />,
  )

  return { onLoadStepPush }
}

describe('LearningPathDetail', () => {
  it('should render every step, none of them disabled or locked', () => {
    renderDetail()

    const rows = screen.getAllByTestId('learning-path-step')

    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const toggle = row.querySelector(
        '[data-testid="learning-path-step-toggle"]',
      ) as HTMLButtonElement

      expect(toggle.disabled).toBe(false)
    }
  })

  it('should highlight the recommended next step and eagerly load its study surface', async () => {
    const { onLoadStepPush } = renderDetail({ nextStepDomainNodeId: 'node-a' })

    await waitFor(() => expect(onLoadStepPush).toHaveBeenCalledWith('node-a'))
    expect(screen.getByTestId('learning-path-step-next-badge')).toBeTruthy()
  })

  it('should never eagerly fetch a push for an empty step, showing the capture CTA instead', () => {
    renderDetail({ nextStepDomainNodeId: 'node-b' })

    expect(screen.getByTestId('learning-path-step-empty-cta')).toBeTruthy()
  })

  it('should let a non-next step open its own study surface just like the next one', async () => {
    const onLoadStepPush = vi
      .fn<(stepDomainNodeId: string) => Promise<ApiResult<StepPushResult>>>()
      .mockResolvedValue({ ok: true, data: { push: null, question: null } })

    renderDetail({ nextStepDomainNodeId: 'node-b', onLoadStepPush })

    const rows = screen.getAllByTestId('learning-path-step')
    const nodeARow = rows.find((row) => row.textContent?.includes('React Hooks'))!

    fireEvent.click(
      nodeARow.querySelector('[data-testid="learning-path-step-toggle"]')!,
    )

    await waitFor(() => expect(onLoadStepPush).toHaveBeenCalledWith('node-a'))
  })

  it('should show the completed banner, never a percent-to-next countdown, once every step is done', () => {
    renderDetail({
      progress: {
        overallStatus: 'done',
        steps: [
          {
            domainNodeId: 'node-a',
            status: 'done',
            progress: { topicsIncluded: 4, topicsMastered: 4, percent: 100 },
          },
        ],
      },
      nextStepDomainNodeId: null,
    })

    expect(screen.getByTestId('learning-path-completed-banner')).toBeTruthy()
  })
})
