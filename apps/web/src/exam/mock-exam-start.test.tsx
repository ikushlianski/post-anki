// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { MockExamStart } from './mock-exam-start'
import type { ExamScopeOption } from './exam-scope-options'

const CURRICULUM_OPTION: ExamScopeOption = {
  scope: 'curriculum',
  scopeId: 'curr-1',
  label: 'This whole curriculum',
}

const MODULE_OPTION: ExamScopeOption = {
  scope: 'module',
  scopeId: 'module-1',
  label: 'Module one',
}

afterEach(() => {
  cleanup()
})

describe('MockExamStart', () => {
  it('should still render a selectable picker when there is only the whole-curriculum option (S6)', () => {
    render(
      <MockExamStart
        busy={false}
        onStart={vi.fn()}
        scopeOptions={[CURRICULUM_OPTION]}
        initialScope={CURRICULUM_OPTION}
      />,
    )

    expect(screen.getByTestId('exam-scope-picker')).not.toBeNull()
    expect(screen.getByTestId('exam-scope-curriculum-curr-1').textContent).toBe(
      CURRICULUM_OPTION.label,
    )
  })

  it('should start with the untouched curriculum scope when the learner never touches the picker (S1)', () => {
    const onStart = vi.fn()

    render(
      <MockExamStart
        busy={false}
        onStart={onStart}
        scopeOptions={[CURRICULUM_OPTION, MODULE_OPTION]}
        initialScope={CURRICULUM_OPTION}
      />,
    )

    fireEvent.click(screen.getByTestId('start-mock-exam'))

    expect(onStart).toHaveBeenCalledWith(10, CURRICULUM_OPTION)
  })

  it('should start with the picked module scope once the learner picks a different option (S2)', () => {
    const onStart = vi.fn()

    render(
      <MockExamStart
        busy={false}
        onStart={onStart}
        scopeOptions={[CURRICULUM_OPTION, MODULE_OPTION]}
        initialScope={CURRICULUM_OPTION}
      />,
    )

    fireEvent.click(screen.getByTestId('exam-scope-module-module-1'))
    fireEvent.click(screen.getByTestId('start-mock-exam'))

    expect(onStart).toHaveBeenCalledWith(10, MODULE_OPTION)
  })
})
