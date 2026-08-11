import { describe, expect, it } from 'vitest'

import type { LearningPathStep, PathStepProgress } from '@post-anki/shared'

import { buildStepViewModels } from './step-view-model'

function step(overrides: Partial<LearningPathStep>): LearningPathStep {
  return {
    id: 'step-1',
    pathId: 'path-1',
    domainNodeId: 'node-1',
    order: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function progress(overrides: Partial<PathStepProgress>): PathStepProgress {
  return {
    domainNodeId: 'node-1',
    status: 'not_started',
    progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
    ...overrides,
  }
}

describe('buildStepViewModels', () => {
  it('should sort steps by their stored order, not input order', () => {
    const models = buildStepViewModels(
      [
        step({ domainNodeId: 'node-b', order: 2 }),
        step({ domainNodeId: 'node-a', order: 1 }),
      ],
      [],
      new Map([
        ['node-a', 'React Hooks'],
        ['node-b', 'React State Management'],
      ]),
      null,
    )

    expect(models.map((m) => m.domainNodeId)).toEqual(['node-a', 'node-b'])
  })

  it('should show zero progress, not a fabricated placeholder, for a step with no matching progress row', () => {
    const [model] = buildStepViewModels(
      [step({ domainNodeId: 'node-1', order: 0 })],
      [],
      new Map([['node-1', 'AWS Networking']]),
      null,
    )

    expect(model!.progress).toEqual({ topicsIncluded: 0, topicsMastered: 0, percent: 0 })
    expect(model!.status).toBe('not_started')
  })

  it('should join live progress by domain node id', () => {
    const [model] = buildStepViewModels(
      [step({ domainNodeId: 'node-1', order: 0 })],
      [
        progress({
          domainNodeId: 'node-1',
          status: 'in_progress',
          progress: { topicsIncluded: 4, topicsMastered: 2, percent: 50 },
        }),
      ],
      new Map([['node-1', 'React Hooks']]),
      null,
    )

    expect(model!.status).toBe('in_progress')
    expect(model!.progress.percent).toBe(50)
  })

  it('should mark exactly the recommended next step, never more than one', () => {
    const models = buildStepViewModels(
      [
        step({ domainNodeId: 'node-a', order: 0 }),
        step({ domainNodeId: 'node-b', order: 1 }),
      ],
      [],
      new Map([
        ['node-a', 'Hooks'],
        ['node-b', 'State'],
      ]),
      'node-b',
    )

    expect(models.find((m) => m.isNext)?.domainNodeId).toBe('node-b')
    expect(models.filter((m) => m.isNext)).toHaveLength(1)
  })

  it('should mark no step as next once every step is done', () => {
    const models = buildStepViewModels(
      [step({ domainNodeId: 'node-a', order: 0 })],
      [progress({ domainNodeId: 'node-a', status: 'done' })],
      new Map([['node-a', 'Hooks']]),
      null,
    )

    expect(models.every((m) => !m.isNext)).toBe(true)
  })
})
