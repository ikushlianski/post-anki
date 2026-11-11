// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { NewSubjectForm } from './new-subject-form'

afterEach(cleanup)

function setup() {
  const onSubmit = vi.fn()

  render(
    <NewSubjectForm
      testIdPrefix="nsf"
      options={[{ id: 'p1', label: 'Networking' }]}
      busy={false}
      confirmLabel="Create"
      onSubmit={onSubmit}
      onBack={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByTestId('nsf-new-name'), { target: { value: 'TCP' } })

  return onSubmit
}

describe('NewSubjectForm', () => {
  it('should offer no Inherit choice for a top-level subject and send no level for Normal', () => {
    const onSubmit = setup()

    expect(screen.queryByText('Complexity: inherit from parent')).toBeNull()
    fireEvent.click(screen.getByTestId('nsf-create'))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'TCP', parentId: null })
  })

  it('should send the picked level for a top-level subject', () => {
    const onSubmit = setup()

    fireEvent.change(screen.getByTestId('nsf-complexity'), { target: { value: 'easy' } })
    fireEvent.click(screen.getByTestId('nsf-create'))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'TCP', parentId: null, complexityLevel: 'easy' })
  })
})
