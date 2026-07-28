import { describe, it, expect } from 'vitest'

import {
  mapCurriculumRow,
  mapSubjectRow,
  resolveCurriculumOrigin,
} from './board.collection'

describe('resolveCurriculumOrigin', () => {
  describe('a curriculum built only from pasted or linked sources', () => {
    it('is sources-origin', () => {
      expect(resolveCurriculumOrigin(['link', 'text'])).toBe('sources')
    })

    it('defaults to sources-origin when there are no sources yet', () => {
      expect(resolveCurriculumOrigin([])).toBe('sources')
    })
  })

  describe('a curriculum that pulled in AI research', () => {
    it('is research-origin when a web_research source is present', () => {
      expect(resolveCurriculumOrigin(['link', 'web_research'])).toBe('research')
    })

    it('is research-origin when an llms_txt source is present', () => {
      expect(resolveCurriculumOrigin(['llms_txt'])).toBe('research')
    })
  })
})

describe('mapSubjectRow', () => {
  it('maps a synced Electric row to the app Subject shape', () => {
    const subject = mapSubjectRow({
      id: 'subj-1',
      name: 'Networking',
      description: 'TCP/IP and friends',
      require_sources: true,
      kind: 'architecture-mentor',
    })

    expect(subject).toEqual({
      id: 'subj-1',
      name: 'Networking',
      description: 'TCP/IP and friends',
      requireSources: true,
      kind: 'architecture-mentor',
    })
  })

  it('turns a null description into undefined, matching the REST mapping', () => {
    const subject = mapSubjectRow({
      id: 'subj-2',
      name: 'Databases',
      description: null,
      require_sources: false,
      kind: 'language-practice',
    })

    expect(subject.description).toBeUndefined()
  })
})

describe('mapCurriculumRow', () => {
  const baseRow = {
    id: 'curr-1',
    subject_id: 'subj-1',
    name: 'Intro to Postgres',
    description: null,
    status: 'confirmed',
    learning_status: 'probing',
    speed: 'normal',
    hinting: true,
    default_depth: 'awareness',
    strict_order: false,
    pre_assessment_completed_at: null,
    domain_node_id: null,
  }

  it('maps a curriculum with no research sources to sources-origin', () => {
    const curriculum = mapCurriculumRow(baseRow, [
      { id: 'src-1', curriculum_id: 'curr-1', kind: 'link' },
    ])

    expect(curriculum.origin).toBe('sources')
  })

  it('maps a curriculum with a web_research source to research-origin', () => {
    const curriculum = mapCurriculumRow(baseRow, [
      { id: 'src-1', curriculum_id: 'curr-1', kind: 'web_research' },
    ])

    expect(curriculum.origin).toBe('research')
  })

  it('only considers sources belonging to this curriculum', () => {
    const curriculum = mapCurriculumRow(baseRow, [
      { id: 'src-1', curriculum_id: 'other-curriculum', kind: 'web_research' },
    ])

    expect(curriculum.origin).toBe('sources')
  })

  it('maps the DB default_depth vocabulary to the app Depth vocabulary', () => {
    const curriculum = mapCurriculumRow(baseRow, [])

    expect(curriculum.defaultDepth).toBe('aware')
  })

  it('carries subjectId, status, and strictOrder through unchanged', () => {
    const curriculum = mapCurriculumRow(baseRow, [])

    expect(curriculum.subjectId).toBe('subj-1')
    expect(curriculum.status).toBe('confirmed')
    expect(curriculum.strictOrder).toBe(false)
  })

  it('carries preAssessmentCompletedAt through unchanged', () => {
    const graded = mapCurriculumRow(
      { ...baseRow, pre_assessment_completed_at: '2026-07-18T00:00:00.000Z' },
      [],
    )
    const ungraded = mapCurriculumRow(baseRow, [])

    expect(graded.preAssessmentCompletedAt).toBe('2026-07-18T00:00:00.000Z')
    expect(ungraded.preAssessmentCompletedAt).toBeNull()
  })
})
