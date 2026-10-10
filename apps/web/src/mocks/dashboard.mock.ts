import type { Curriculum, Subject } from '../curriculum/model'
import type { DueTopic } from '../curriculum/api-client'
import type { Streak } from '@post-anki/shared'

export const dashboardSubjects: Subject[] = [
  {
    id: 'subject-business',
    name: 'Business',
    kind: 'architecture-mentor',
    requireSources: false,
    modelTier: null,
    parentId: null,
  },
  {
    id: 'subject-software-architecture',
    name: 'Software architecture',
    kind: 'architecture-mentor',
    requireSources: true,
    modelTier: null,
    parentId: null,
  },
  {
    id: 'subject-english',
    name: 'English',
    kind: 'language-practice',
    requireSources: false,
    modelTier: null,
    parentId: null,
  },
]

function curriculumFixture(overrides: Pick<Curriculum, 'id' | 'subjectId' | 'name' | 'status' | 'order'>): Curriculum {
  return {
    learningStatus: 'reviewing',
    speed: 'normal',
    hinting: true,
    defaultDepth: 'working',
    origin: 'research',
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: null,
    modelTier: null,
    categoryId: null,
    ...overrides,
  }
}

export const dashboardCurricula: Curriculum[] = [
  curriculumFixture({
    id: 'curriculum-unit-economics',
    subjectId: 'subject-business',
    name: 'Unit economics',
    status: 'confirmed',
    order: 1,
  }),
  curriculumFixture({
    id: 'curriculum-negotiation',
    subjectId: 'subject-business',
    name: 'Negotiation basics',
    status: 'awaiting_source_approval',
    order: 2,
  }),
  curriculumFixture({
    id: 'curriculum-event-driven',
    subjectId: 'subject-software-architecture',
    name: 'Event-driven systems',
    status: 'confirmed',
    order: 1,
  }),
]

export const dashboardStreak: Streak = {
  currentStreak: 4,
  longestStreak: 12,
  lastActiveDate: '2026-10-10',
}

export const dashboardDueTopics: DueTopic[] = [
  { topicId: 'topic-customer-acquisition-cost', title: 'Customer acquisition cost', dueCount: 3 },
  { topicId: 'topic-cqrs-read-models', title: 'CQRS read models', dueCount: 2 },
]
