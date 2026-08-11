import { describe, expect, it } from 'vitest'

import { criteriaLabel, entityTypeLabel } from './milestone-criteria-label'

describe('criteriaLabel', () => {
  it('should label the one v1 criteria plainly', () => {
    expect(criteriaLabel('full_mastery')).toBe('Fully mastered')
  })

  it('should fall back to the raw key for a future, still-unmapped criteria', () => {
    expect(criteriaLabel('first_week_of_activity')).toBe('first_week_of_activity')
  })
})

describe('entityTypeLabel', () => {
  it('should label a curriculum milestone', () => {
    expect(entityTypeLabel('curriculum')).toBe('Curriculum')
  })

  it('should label a domain-node milestone as an Area', () => {
    expect(entityTypeLabel('domain_node')).toBe('Area')
  })
})
