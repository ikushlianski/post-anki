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

  it('should create a top-level subject without a level when Normal is kept, and with the picked level otherwise', async () => {
    vi.mocked(createSubject).mockReset()
    vi.mocked(createSubject).mockResolvedValue({ id: 's1' } as Awaited<ReturnType<typeof createSubject>>)
    render(<CreateSubjectForm />)

    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Rust' } })
    fireEvent.click(screen.getByTestId('subject-add-button'))
    await waitFor(() => expect(createSubject).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createSubject).mock.calls[0]?.[0].data).not.toHaveProperty('complexityLevel')

    fireEvent.change(screen.getByTestId('subject-complexity-select'), { target: { value: 'cram' } })
    fireEvent.click(screen.getByTestId('subject-add-button'))
    await waitFor(() => expect(createSubject).toHaveBeenCalledTimes(2))
    expect(vi.mocked(createSubject).mock.calls[1]?.[0].data).toMatchObject({ complexityLevel: 'cram' })
  })
})
