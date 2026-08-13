import { describe, expect, it } from 'vitest'

import { pathStatusLabel, stepStatusLabel } from './path-status-label'

describe('pathStatusLabel', () => {
  it('should label every path status distinctly', () => {
    expect(pathStatusLabel('draft')).toBe('Draft')
    expect(pathStatusLabel('active')).toBe('In progress')
    expect(pathStatusLabel('completed')).toBe('Completed')
    expect(pathStatusLabel('abandoned')).toBe('Abandoned')
  })
})

describe('stepStatusLabel', () => {
  it('should label every step status distinctly', () => {
    expect(stepStatusLabel('not_started')).toBe('Not started')
    expect(stepStatusLabel('in_progress')).toBe('In progress')
    expect(stepStatusLabel('done')).toBe('Done')
  })
})
