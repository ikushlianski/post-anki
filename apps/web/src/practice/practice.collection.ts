import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'

import type { Pack, Phrase, PracticeAttempt, PracticeLevel, PracticeSettings } from '@post-anki/shared'

const SHAPE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/electric-shape`
    : '/api/electric-shape'

interface PhraseRow {
  [key: string]: unknown
  id: string
  subject_id: string
  batch_id: string
  level: PracticeLevel
  pack: Pack
  position: number
  russian: string
  reference_english: string
  domain: Phrase['domain']
  created_at: string
}

interface AttemptRow {
  [key: string]: unknown
  id: string
  subject_id: string
  phrase_id: string
  user_answer: string
  score: number
  verdict: PracticeAttempt['verdict']
  feedback: string
  native_alternatives: string[]
  created_at: string
}

interface SettingsRow {
  [key: string]: unknown
  subject_id: string
  level: PracticeLevel
  pack: Pack
  updated_at: string
}

export const phrasesCollection = createCollection(
  electricCollectionOptions<PhraseRow>({
    id: 'practice-phrases',
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'phrases' },
    },
    getKey: (row) => row.id,
  }),
)

export const attemptsCollection = createCollection(
  electricCollectionOptions<AttemptRow>({
    id: 'practice-attempts',
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'attempts' },
    },
    getKey: (row) => row.id,
  }),
)

export const practiceSettingsCollection = createCollection(
  electricCollectionOptions<SettingsRow>({
    id: 'practice-settings',
    shapeOptions: {
      url: SHAPE_URL,
      params: { table: 'language_practice_settings' },
    },
    getKey: (row) => row.subject_id,
  }),
)

export function mapPhraseRow(row: PhraseRow): Phrase {
  return {
    id: row.id,
    subjectId: row.subject_id,
    batchId: row.batch_id,
    level: row.level,
    pack: row.pack,
    position: row.position,
    russian: row.russian,
    referenceEnglish: row.reference_english,
    domain: row.domain,
    createdAt: row.created_at,
  }
}

export function mapAttemptRow(row: AttemptRow): PracticeAttempt {
  return {
    id: row.id,
    subjectId: row.subject_id,
    phraseId: row.phrase_id,
    userAnswer: row.user_answer,
    score: row.score,
    verdict: row.verdict,
    feedback: row.feedback,
    nativeAlternatives: row.native_alternatives,
    createdAt: row.created_at,
  }
}

export function mapPracticeSettingsRow(row: SettingsRow): PracticeSettings {
  return {
    subjectId: row.subject_id,
    level: row.level,
    pack: row.pack,
  }
}
