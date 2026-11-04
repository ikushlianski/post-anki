// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }) }))
vi.mock('./curriculum.api', () => ({ createCurriculum: vi.fn() }))

import { createCurriculum } from './curriculum.api'
import { CreateCurriculumForm } from './create-curriculum-form'

afterEach(cleanup)

describe('CreateCurriculumForm', () => {
  it('should give the curriculum name field an accessible name once opened', () => {
    render(<CreateCurriculumForm subjectId="s1" />)
    fireEvent.click(screen.getByTestId('curriculum-create-toggle'))

    expect(screen.getByLabelText('Curriculum name')).toBeTruthy()
  })

  it('should show a failure and re-enable the button when creating the curriculum fails', async () => {
    vi.mocked(createCurriculum).mockRejectedValueOnce(new Error('network'))
    render(<CreateCurriculumForm subjectId="s1" />)
    fireEvent.click(screen.getByTestId('curriculum-create-toggle'))
    fireEvent.change(screen.getByTestId('curriculum-name-input'), { target: { value: 'Redis' } })
    fireEvent.click(screen.getByTestId('curriculum-create-submit'))

    expect(await screen.findByTestId('curriculum-create-error')).toBeTruthy()
    await waitFor(() => expect((screen.getByTestId('curriculum-create-submit') as HTMLButtonElement).disabled).toBe(false))
  })
})
