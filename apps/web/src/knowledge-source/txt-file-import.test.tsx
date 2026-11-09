// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TxtFileImport } from './txt-file-import'
import { getTxtImportStatus, uploadTxtFile } from './txt-file-import.api'

vi.mock('./txt-file-import.api', () => ({ uploadTxtFile: vi.fn(), getTxtImportStatus: vi.fn() }))

const mockedUpload = vi.mocked(uploadTxtFile)
const mockedStatus = vi.mocked(getTxtImportStatus)

function pick(file: File) {
  fireEvent.change(screen.getByTestId('txt-import-input'), { target: { files: [file] } })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TxtFileImport', () => {
  it('should upload an Anki export and show how far the import has got', async () => {
    mockedUpload.mockResolvedValue({ kind: 'anki', importId: 'txt-abc', parsed: 3, skippedEmpty: 0, newlyStaged: 3 })
    mockedStatus.mockResolvedValue({ importId: 'txt-abc', staged: 1, imported: 2, extracted: 0 })
    render(<TxtFileImport subjectId="sub_1" />)

    pick(new File(['#separator:tab\n'], 'Business.txt', { type: 'text/plain' }))

    await waitFor(() => expect(screen.getByTestId('txt-import-status').textContent).toContain('2 imported'))
    expect(mockedUpload).toHaveBeenCalledWith({ data: { text: '#separator:tab\n', subjectId: 'sub_1' } })
  })

  it('should refuse a non-text file without calling the server', async () => {
    render(<TxtFileImport subjectId="" />)

    pick(new File(['x'], 'notes.pdf'))

    expect((await screen.findByTestId('txt-import-error')).textContent).toBe('Only .txt files can be imported.')
    expect(mockedUpload).not.toHaveBeenCalled()
  })

  it('should show the server refusal in plain words', async () => {
    mockedUpload.mockRejectedValue(new Error('Choose a subject for this file.'))
    render(<TxtFileImport subjectId="" />)

    pick(new File(['hello'], 'a.txt'))

    expect((await screen.findByTestId('txt-import-error')).textContent).toBe('Choose a subject for this file.')
  })
})
