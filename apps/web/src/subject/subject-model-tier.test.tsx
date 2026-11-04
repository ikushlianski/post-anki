// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { SubjectModelTier } from './subject-model-tier'
import { updateSubjectModelTier } from './subject.api'

vi.mock('./subject.api', () => ({ updateSubjectModelTier: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))

afterEach(cleanup)

describe('SubjectModelTier', () => {
  it('should show a failure and re-enable the buttons when the save fails', async () => {
    vi.mocked(updateSubjectModelTier).mockRejectedValue(new Error('boom'))
    render(<SubjectModelTier subjectId="s1" modelTier={null} globalModelTier="balanced" />)

    fireEvent.click(screen.getByTestId('subject-model-tier-option-s1-premium'))

    expect(await screen.findByTestId('subject-model-tier-failed-s1')).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByTestId('subject-model-tier-option-s1-premium') as HTMLButtonElement).disabled).toBe(false),
    )
  })
})
