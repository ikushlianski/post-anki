import { describe, expect, it } from 'vitest'

import { buildExamScopeOptions } from './exam-scope-options'
import type { CurriculumDetail } from '../curriculum/model'

function module(overrides: Partial<CurriculumDetail['modules'][number]>) {
  return {
    id: 'module-1',
    curriculumId: 'curriculum-1',
    title: 'Module one',
    order: 0,
    priority: 'medium',
    learningStatus: 'learning',
    level: null,
    topics: [],
    progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
    dueCount: 0,
    ...overrides,
  } as CurriculumDetail['modules'][number]
}

function tag(id: string, name: string) {
  return { id, name, normalizedName: name, assignmentId: `assignment-${id}` }
}

describe('buildExamScopeOptions', () => {
  it('should always lead with the whole-curriculum option, even with no modules or tags', () => {
    const options = buildExamScopeOptions('curriculum-1', [])

    expect(options).toEqual([
      { scope: 'curriculum', scopeId: 'curriculum-1', label: 'This whole curriculum' },
    ])
  })

  it('should add one option per module, in curriculum order', () => {
    const modules = [
      module({ id: 'module-1', title: 'Module one' }),
      module({ id: 'module-2', title: 'Module two' }),
    ]

    const options = buildExamScopeOptions('curriculum-1', modules)

    expect(options.slice(1, 3)).toEqual([
      { scope: 'module', scopeId: 'module-1', label: 'Module one' },
      { scope: 'module', scopeId: 'module-2', label: 'Module two' },
    ])
  })

  it('should dedupe tags shared across modules and topics by tag id, not assignment id', () => {
    const modules = [
      module({
        id: 'module-1',
        tags: [tag('tag-1', 'async')],
        topics: [
          {
            id: 'topic-1',
            moduleId: 'module-1',
            title: 'Topic one',
            order: 0,
            priority: 'medium',
            included: true,
            selfGrade: null,
            targetDepth: 'standard',
            learningStatus: 'learning',
            gaps: [],
            progress: { status: 'not_started' },
            tags: [tag('tag-1', 'async')],
            depthElectedAt: null,
            headroomOfferedAt: null,
          } as unknown as CurriculumDetail['modules'][number]['topics'][number],
        ],
      }),
      module({ id: 'module-2', tags: [tag('tag-1', 'async'), tag('tag-2', 'io')] }),
    ]

    const options = buildExamScopeOptions('curriculum-1', modules)
    const tagOptions = options.filter((option) => option.scope === 'tag')

    expect(tagOptions).toEqual([
      { scope: 'tag', scopeId: 'tag-1', label: '#async' },
      { scope: 'tag', scopeId: 'tag-2', label: '#io' },
    ])
  })
})
