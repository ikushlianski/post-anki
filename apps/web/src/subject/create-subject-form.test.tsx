// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('./subject.api', () => ({ createSubject: vi.fn() }))

import { CreateSubjectForm } from './create-subject-form'
import { createSubject } from './subject.api'

afterEach(cleanup)

describe('CreateSubjectForm', () => {
  it('should give the name, description and kind fields accessible names', () => {
    render(<CreateSubjectForm />)

    expect(screen.getByLabelText('Subject name')).toBeTruthy()
    expect(screen.getByLabelText('Subject description')).toBeTruthy()
    expect(screen.getByLabelText('Subject kind')).toBeTruthy()
  })

  it('should show an error, keep the typed name and re-enable Add when creating fails', async () => {
    vi.mocked(createSubject).mockRejectedValue(new Error('boom'))
    render(<CreateSubjectForm />)

    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Rust' } })
    fireEvent.click(screen.getByTestId('subject-add-button'))

    expect(await screen.findByTestId('subject-create-failed')).toBeTruthy()
    expect((screen.getByLabelText('Subject name') as HTMLInputElement).value).toBe('Rust')
    await waitFor(() => expect((screen.getByTestId('subject-add-button') as HTMLButtonElement).disabled).toBe(false))
  })
})
