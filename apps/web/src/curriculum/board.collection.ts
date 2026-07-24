import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'

import type {
  Curriculum,
  CurriculumOrigin,
  CurriculumStatus,
  Depth,
  LearningStatus,
  Speed,
  Subject,
} from './model'

const SHAPE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/electric-shape`
    : '/api/electric-shape'

interface SubjectRow {
  [key: string]: unknown
  id: string
  name: string
  description: string | null
  require_sources: boolean
  kind: string
}

interface CurriculumRow {
  [key: string]: unknown
  id: string
  subject_id: string
  name: string
  description: string | null
  status: string
  learning_status: string
  speed: string
  hinting: boolean
  default_depth: string
  strict_order: boolean
  pre_assessment_completed_at: string | null
}

interface CurriculumSourceRow {
  [key: string]: unknown
  id: string
  curriculum_id: string
  kind: string
}

export const subjectsCollection = createCollection(
  electricCollectionOptions<SubjectRow>({
    id: 'board-subjects',
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'subjects' },
    },
    getKey: (row) => row.id,
  }),
)

export const curriculaCollection = createCollection(
  electricCollectionOptions<CurriculumRow>({
    id: 'board-curricula',
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'curricula' },
    },
    getKey: (row) => row.id,
  }),
)

export const curriculumSourcesCollection = createCollection(
  electricCollectionOptions<CurriculumSourceRow>({
    id: 'board-curriculum-sources',
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'sources', columns: ['id', 'curriculum_id', 'kind'] },
    },
    getKey: (row) => row.id,
  }),
)

const DEPTH_FROM_DB: Record<string, Depth> = {
  awareness: 'aware',
  working: 'working',
  deep: 'deep',
}

// Mirrors resolveCurriculumOrigin() in apps/api/src/curriculum/curriculum-rules.ts —
// `origin` is not a stored column, it's derived from which source kinds a
// curriculum has, so the read-path swap has to replicate that rule client-side.
const RESEARCH_ORIGIN_KINDS = new Set(['web_research', 'llms_txt'])

export function mapSubjectRow(row: SubjectRow): Subject {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    requireSources: row.require_sources,
    kind: row.kind as Subject['kind'],
  }
}

export function resolveCurriculumOrigin(sourceKinds: string[]): CurriculumOrigin {
  return sourceKinds.some((kind) => RESEARCH_ORIGIN_KINDS.has(kind))
    ? 'research'
    : 'sources'
}

export function mapCurriculumRow(
  row: CurriculumRow,
  sources: CurriculumSourceRow[],
): Curriculum {
  const kinds = sources
    .filter((source) => source.curriculum_id === row.id)
    .map((source) => source.kind)

  return {
    id: row.id,
    subjectId: row.subject_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as CurriculumStatus,
    learningStatus: row.learning_status as LearningStatus,
    speed: row.speed as Speed,
    hinting: row.hinting,
    defaultDepth: DEPTH_FROM_DB[row.default_depth] ?? 'working',
    origin: resolveCurriculumOrigin(kinds),
    strictOrder: row.strict_order,
    preAssessmentCompletedAt: row.pre_assessment_completed_at,
  }
}
