import { describe, it, expect } from 'vitest'

import { mapAttemptRow, mapPhraseRow, mapPracticeSettingsRow } from './practice.collection'

describe('mapPhraseRow', () => {
  it('maps a synced Electric row to the shared Phrase shape', () => {
    const phrase = mapPhraseRow({
      id: 'phrase-1',
      subject_id: 'subj-1',
      batch_id: 'batch-1',
      level: 'B1_B2',
      pack: 'General',
      position: 1,
      russian: 'Привет',
      reference_english: 'Hello',
      domain: 'Everyday',
      target_phrase_bank_entry_id: null,
      sequence_number: 1,
      created_at: '2026-07-25T00:00:00.000Z',
    })

    expect(phrase).toEqual({
      id: 'phrase-1',
      subjectId: 'subj-1',
      batchId: 'batch-1',
      level: 'B1_B2',
      pack: 'General',
      position: 1,
      russian: 'Привет',
      referenceEnglish: 'Hello',
      domain: 'Everyday',
      targetPhraseBankEntryId: null,
      sequenceNumber: 1,
      createdAt: '2026-07-25T00:00:00.000Z',
    })
  })

  it('carries a non-null target_phrase_bank_entry_id through for a recycled phrase', () => {
    const phrase = mapPhraseRow({
      id: 'phrase-2',
      subject_id: 'subj-1',
      batch_id: 'batch-2',
      level: 'B1_B2',
      pack: 'General',
      position: 3,
      russian: 'Довести дело до конца',
      reference_english: 'See it through',
      domain: 'Everyday',
      target_phrase_bank_entry_id: 'pbentry-1',
      sequence_number: 12,
      created_at: '2026-07-25T00:00:00.000Z',
    })

    expect(phrase.targetPhraseBankEntryId).toBe('pbentry-1')
    expect(phrase.sequenceNumber).toBe(12)
  })
})

describe('mapAttemptRow', () => {
  it('maps a synced Electric row to the shared PracticeAttempt shape', () => {
    const attempt = mapAttemptRow({
      id: 'attempt-1',
      subject_id: 'subj-1',
      phrase_id: 'phrase-1',
      user_answer: 'Hello',
      score: 8,
      verdict: 'Ok',
      feedback: 'Solid, native-sounding.',
      native_alternatives: ['Hi there'],
      created_at: '2026-07-25T00:00:00.000Z',
    })

    expect(attempt).toEqual({
      id: 'attempt-1',
      subjectId: 'subj-1',
      phraseId: 'phrase-1',
      userAnswer: 'Hello',
      score: 8,
      verdict: 'Ok',
      feedback: 'Solid, native-sounding.',
      nativeAlternatives: ['Hi there'],
      createdAt: '2026-07-25T00:00:00.000Z',
    })
  })

  it('preserves an empty native alternatives array rather than dropping it', () => {
    const attempt = mapAttemptRow({
      id: 'attempt-2',
      subject_id: 'subj-1',
      phrase_id: 'phrase-2',
      user_answer: 'Hi',
      score: 5,
      verdict: 'NeedsReview',
      feedback: 'A bit stiff.',
      native_alternatives: [],
      created_at: '2026-07-25T00:00:00.000Z',
    })

    expect(attempt.nativeAlternatives).toEqual([])
  })
})

describe('mapPracticeSettingsRow', () => {
  it('maps a synced Electric row to the shared PracticeSettings shape', () => {
    const settings = mapPracticeSettingsRow({
      subject_id: 'subj-1',
      level: 'A1_A2',
      pack: 'CodeReview',
      updated_at: '2026-07-25T00:00:00.000Z',
    })

    expect(settings).toEqual({
      subjectId: 'subj-1',
      level: 'A1_A2',
      pack: 'CodeReview',
    })
  })

  it('drops the updated_at column, matching the shared PracticeSettings shape', () => {
    const settings = mapPracticeSettingsRow({
      subject_id: 'subj-2',
      level: 'C1_C2',
      pack: 'GivingFeedback',
      updated_at: '2026-07-25T00:00:00.000Z',
    })

    expect(settings).not.toHaveProperty('updatedAt')
  })
})
