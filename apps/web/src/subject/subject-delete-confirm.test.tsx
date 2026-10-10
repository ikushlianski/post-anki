// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  SubjectDeleteConfirm,
  describeSubjectDeleteImpact,
  subjectDeleteConfirmLabel,
} from './subject-delete-confirm'

afterEach(() => {
  cleanup()
})

describe('describeSubjectDeleteImpact', () => {
  it('should name the courses that will be deleted and the sub-subjects that will move up', () => {
    expect(describeSubjectDeleteImpact(2, 3)).toEqual([
      '2 courses will be deleted, with their sources and topics.',
      '3 sub-subjects will move to the top level.',
    ])
  })

  it('should use the singular form for exactly one course or sub-subject', () => {
    expect(describeSubjectDeleteImpact(1, 1)).toEqual([
      '1 course will be deleted, with their sources and topics.',
      '1 sub-subject will move to the top level.',
    ])
  })

  it('should say that nothing else is affected when there are no courses or sub-subjects', () => {
    expect(describeSubjectDeleteImpact(0, 0)).toEqual(['It has no courses or sub-subjects.'])
  })

  it('should say the counts are still loading instead of claiming zero when they are unknown', () => {
    expect(describeSubjectDeleteImpact(null, null)).toEqual([
      'Its courses are still loading, so they are not counted yet.',
      'Its sub-subjects are still loading, so they are not counted yet.',
    ])
  })
})

describe('subjectDeleteConfirmLabel', () => {
  it('should name the number of courses in the confirm button', () => {
    expect(subjectDeleteConfirmLabel(4)).toBe('Delete subject and 4 courses')
    expect(subjectDeleteConfirmLabel(1)).toBe('Delete subject and 1 course')
  })

  it('should read as a plain delete when there are no courses or the count is unknown', () => {
    expect(subjectDeleteConfirmLabel(0)).toBe('Delete subject')
    expect(subjectDeleteConfirmLabel(null)).toBe('Delete subject')
  })
})

describe('SubjectDeleteConfirm', () => {
  const testIds = { confirm: 'confirm', cancel: 'cancel', error: 'error' }

  it('should show the courses and sub-subjects impact and name the courses in the confirm button', () => {
    render(
      <SubjectDeleteConfirm
        subjectName="Biology"
        curriculumCount={2}
        subSubjectCount={1}
        busy={false}
        error={null}
        testIds={testIds}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Delete Biology?')).toBeTruthy()
    expect(screen.getByTestId('subject-delete-impact').textContent).toContain(
      '1 sub-subject will move to the top level.',
    )
    expect(screen.getByTestId('confirm').textContent).toBe('Delete subject and 2 courses')
  })

  it('should call onConfirm only when the delete button is pressed', () => {
    const onConfirm = vi.fn()

    render(
      <SubjectDeleteConfirm
        subjectName="Biology"
        curriculumCount={1}
        subSubjectCount={0}
        busy={false}
        error={null}
        testIds={testIds}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('cancel'))
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
