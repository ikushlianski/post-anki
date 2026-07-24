import type { Pack, PracticeLevel } from '@post-anki/shared'

export const BATCH_SIZE = 10

export const LEVEL_VALUES: PracticeLevel[] = ['A1_A2', 'B1_B2', 'C1_C2']

export const LEVEL_LABELS: Record<PracticeLevel, string> = {
  A1_A2: 'A1–A2 · Beginner',
  B1_B2: 'B1–B2 · Intermediate',
  C1_C2: 'C1–C2 · Advanced',
}

export const PACK_VALUES: Pack[] = [
  'General',
  'StandupUpdates',
  'CodeReview',
  'IncidentPostmortems',
  'GivingFeedback',
]

export const PACK_LABELS: Record<Pack, string> = {
  General: 'General',
  StandupUpdates: 'Standup updates',
  CodeReview: 'Code review',
  IncidentPostmortems: 'Incident postmortems',
  GivingFeedback: 'Giving feedback',
}
