// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { ProbeQuestion } from '@post-anki/shared'

import { LearningPathStepRow } from './learning-path-step-row'
import type { StepViewModel } from './step-view-model'
import type { StepPushResult } from './learning-path.model'

vi.mock('../curriculum/probe-answer', () => ({
  ProbeAnswer: ({ question }: { question: { prompt: string } }) => (
    <div data-testid="mock-probe-answer">{question.prompt}</div>
  ),
}))

afterEach(cleanup)

function stepModel(overrides: Partial<StepViewModel>): StepViewModel {
  return {
    domainNodeId: 'node-1',
    name: 'React Hooks',
    order: 0,
    status: 'not_started',
    progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
    isNext: false,
    ...overrides,
  }
}

function question(overrides: Partial<ProbeQuestion>): ProbeQuestion {
  return {
    gapId: 'gap-1',
    gapLabel: 'closures',
    kind: 'socratic',
    prompt: 'Explain closures.',
    ...overrides,
  }
}

function renderRow(overrides: Partial<React.ComponentProps<typeof LearningPathStepRow>> = {}) {
  const onToggle = vi.fn()

  render(
    <LearningPathStepRow
      step={stepModel({})}
      expanded={false}
      loading={false}
      pushResult={undefined}
      subjects={[{ id: 'subject-1', name: 'Web Development' }]}
      onToggle={onToggle}
      onCapture={vi.fn().mockResolvedValue({ ok: true, data: {} })}
      onCaptured={vi.fn()}
      {...overrides}
    />,
  )

  return { onToggle }
}

describe('LearningPathStepRow', () => {
  it('should never render a locked/disabled affordance on the step toggle', () => {
    renderRow({})

    const toggle = screen.getByTestId('learning-path-step-toggle') as HTMLButtonElement

    expect(toggle.disabled).toBe(false)
  })

  it('should call onToggle for a non-next step exactly like a next step — nothing gates it', () => {
    const { onToggle } = renderRow({ step: stepModel({ isNext: false }) })

    fireEvent.click(screen.getByTestId('learning-path-step-toggle'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('should show the next badge only when the step is recommended', () => {
    renderRow({ step: stepModel({ isNext: true }) })

    expect(screen.getByTestId('learning-path-step-next-badge')).toBeTruthy()
  })

  it('should show the empty-step capture CTA for a step with zero included topics', () => {
    renderRow({
      expanded: true,
      step: stepModel({ progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 } }),
    })

    expect(screen.getByTestId('learning-path-step-empty-cta')).toBeTruthy()
    expect(screen.getByTestId('learning-list-capture-form')).toBeTruthy()
  })

  it('should show a loading state while the push question is being fetched', () => {
    renderRow({
      expanded: true,
      step: stepModel({ progress: { topicsIncluded: 3, topicsMastered: 1, percent: 33 } }),
      loading: true,
      pushResult: undefined,
    })

    expect(screen.getByTestId('learning-path-step-loading')).toBeTruthy()
  })

  it('should say plainly when nothing is left to study, never a fabricated question', () => {
    const pushResult: StepPushResult = { push: null, question: null }

    renderRow({
      expanded: true,
      step: stepModel({ progress: { topicsIncluded: 3, topicsMastered: 3, percent: 100 } }),
      pushResult,
    })

    expect(screen.getByTestId('learning-path-step-nothing-to-study')).toBeTruthy()
  })

  it('should render the shared push-question surface once a candidate is found', () => {
    const pushResult: StepPushResult = {
      push: {
        topicId: 'topic-1',
        topicTitle: 'Hooks',
        curriculumId: 'curriculum-1',
        curriculumName: 'React Deep Dive',
        gap: {
          id: 'gap-1',
          topicId: 'topic-1',
          label: 'useEffect cleanup',
          state: 'open',
          depth: 'working',
          origin: 'ai',
          wanted: true,
          concern: null,
          lastEvaluatedAt: null,
          mastery: null,
          triageState: 'untriaged',
          triagedAt: null,
          deferredUntil: null,
          deferralCount: 0,
          dismissedAt: null,
          dismissedCheckinSentAt: null,
        },
        reason: 'weakest',
      },
      question: question({}),
    }

    renderRow({
      expanded: true,
      step: stepModel({ progress: { topicsIncluded: 3, topicsMastered: 1, percent: 33 } }),
      pushResult,
    })

    expect(screen.getByTestId('mock-probe-answer').textContent).toBe('Explain closures.')
  })
})
