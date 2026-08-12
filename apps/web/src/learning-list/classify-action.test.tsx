// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ClassifyAction } from './classify-action'

afterEach(cleanup)

const SUBJECTS = [
  { id: 'subject-1', name: 'Web Development' },
  { id: 'subject-2', name: 'Cloud & AWS' },
]

function renderAction(
  onClassify = vi.fn().mockResolvedValue({ ok: true, data: {} }),
) {
  const onClassified = vi.fn()

  render(
    <ClassifyAction
      itemId="sibling-1"
      subjects={SUBJECTS}
      onClassify={onClassify}
      onClassified={onClassified}
    />,
  )

  return { onClassify, onClassified }
}

describe('ClassifyAction', () => {
  it('should classify a discovered sibling against the chosen subject', async () => {
    const { onClassify, onClassified } = renderAction()

    fireEvent.change(screen.getByTestId('classify-action-subject'), {
      target: { value: 'subject-2' },
    })
    fireEvent.click(screen.getByTestId('classify-action-submit'))

    await waitFor(() => expect(onClassified).toHaveBeenCalled())
    expect(onClassify).toHaveBeenCalledWith({
      itemId: 'sibling-1',
      subjectId: 'subject-2',
      subSubjectNodeId: null,
    })
  })

  it('should default to the first subject', async () => {
    const { onClassify } = renderAction()

    fireEvent.click(screen.getByTestId('classify-action-submit'))

    await waitFor(() =>
      expect(onClassify).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'subject-1' }),
      ),
    )
  })

  it('should surface a claim conflict instead of failing silently', async () => {
    const onClassify = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      code: 'not_capturable',
      message: null,
    })
    renderAction(onClassify)

    fireEvent.click(screen.getByTestId('classify-action-submit'))

    expect(
      (await screen.findByTestId('classify-action-error')).textContent,
    ).toContain('not_capturable')
  })
})
