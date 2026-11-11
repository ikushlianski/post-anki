import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SubjectTodayColumns } from './subject-today-columns'

const today = { status: 'ready' as const, byId: new Map<string, number>() }

describe('SubjectTodayColumns', () => {
  it('should tint non-zero mature, learning and new counts by card type', () => {
    render(<SubjectTodayColumns subjectId="s" matureCount={2} learningCount={3} newCount={4} today={today} />)

    expect(screen.getByTestId('knowledge-browser-subject-mature-s').className).toContain('text-green-600')
    expect(screen.getByTestId('knowledge-browser-subject-learning-s').className).toContain('text-orange-600')
    expect(screen.getByTestId('knowledge-browser-subject-new-s').className).toContain('text-blue-600')
  })

  it('should keep zero counts grey', () => {
    render(<SubjectTodayColumns subjectId="s" matureCount={0} learningCount={0} newCount={0} today={today} />)

    expect(screen.getByTestId('knowledge-browser-subject-mature-s').className).toContain('text-neutral-400')
    expect(screen.getByTestId('knowledge-browser-subject-new-s').className).not.toContain('text-blue')
  })
})
