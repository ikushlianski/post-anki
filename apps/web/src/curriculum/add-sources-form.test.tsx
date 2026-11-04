// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }) }))
vi.mock('./curriculum.api', () => ({ addSourcesToCurriculum: vi.fn() }))
vi.mock('./use-source-rows', () => ({
  useSourceRows: () => ({
    rows: [],
    addRow: vi.fn(),
    updateRow: vi.fn(),
    removeRow: vi.fn(),
    reset: vi.fn(),
    toDrafts: () => [{ kind: 'url', url: 'https://example.com' }],
  }),
}))
vi.mock('./source-rows-editor', () => ({ SourceRowsEditor: () => null }))

import { AddSourcesForm } from './add-sources-form'
import { addSourcesToCurriculum } from './curriculum.api'

afterEach(cleanup)

describe('AddSourcesForm', () => {
  it('should show a failure and re-enable the button when adding sources fails', async () => {
    vi.mocked(addSourcesToCurriculum).mockRejectedValueOnce(new Error('network'))
    render(<AddSourcesForm curriculumId="c1" />)
    fireEvent.click(screen.getByText('+ Add sources'))
    fireEvent.click(screen.getByRole('button', { name: 'Add sources' }))

    expect(await screen.findByTestId('add-sources-error')).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Add sources' }) as HTMLButtonElement).disabled).toBe(false),
    )
  })
})
