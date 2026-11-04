// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { deleteTag, renameTag } from '../curriculum/curriculum.api'
import { TagDeleteControl, TagRenameControl } from './tag-chip-actions'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('../curriculum/curriculum.api')

const tag = { id: 'tag-1', name: 'Caching', normalizedName: 'caching' }

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function startRename(name: string) {
  fireEvent.click(screen.getByTestId('tag-list-rename-button-tag-1'))
  fireEvent.change(screen.getByTestId('tag-list-rename-input-tag-1'), { target: { value: name } })
  fireEvent.click(screen.getByTestId('tag-list-rename-save-tag-1'))
}

describe('TagRenameControl', () => {
  it('should send the trimmed new name and close the editor on success', async () => {
    vi.mocked(renameTag).mockResolvedValue({ ok: true, tag: { ...tag, name: 'Cache' } })
    renderWithClient(<TagRenameControl tag={tag} />)

    startRename('  Cache  ')

    await waitFor(() => expect(renameTag).toHaveBeenCalledWith({ data: { tagId: 'tag-1', name: 'Cache' } }))
    await waitFor(() => expect(screen.queryByTestId('tag-list-rename-input-tag-1')).toBeNull())
  })

  it('should not call the API when the name is unchanged', () => {
    renderWithClient(<TagRenameControl tag={tag} />)

    startRename('Caching')

    expect(renameTag).not.toHaveBeenCalled()
    expect(screen.queryByTestId('tag-list-rename-input-tag-1')).toBeNull()
  })

  it('should show an inline alert and keep the editor open when the name is taken', async () => {
    vi.mocked(renameTag).mockResolvedValue({ ok: false, reason: 'name_taken' })
    renderWithClient(<TagRenameControl tag={tag} />)

    startRename('Cache')

    const alert = await screen.findByRole('alert')

    expect(alert.textContent).toBe('Another tag already has that name')
    expect(screen.getByTestId('tag-list-rename-input-tag-1')).toBeTruthy()
  })

  it('should show the generic failure line and unlock when the call throws', async () => {
    vi.mocked(renameTag).mockRejectedValue(new Error('boom'))
    renderWithClient(<TagRenameControl tag={tag} />)

    startRename('Cache')

    const alert = await screen.findByRole('alert')

    expect(alert.textContent).toBe("Couldn't do that, try again")
    expect((screen.getByTestId('tag-list-rename-save-tag-1') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should clear the taken message when the rename is cancelled', async () => {
    vi.mocked(renameTag).mockResolvedValue({ ok: false, reason: 'name_taken' })
    renderWithClient(<TagRenameControl tag={tag} />)

    startRename('Cache')
    await screen.findByRole('alert')
    fireEvent.click(screen.getByTestId('tag-list-rename-cancel-tag-1'))

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('TagDeleteControl', () => {
  it('should state the consequence and delete only after confirming', async () => {
    vi.mocked(deleteTag).mockResolvedValue(null)
    renderWithClient(<TagDeleteControl tag={tag} />)

    await waitFor(() =>
      expect((screen.getByTestId('tag-list-delete-tag-1-button') as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(screen.getByTestId('tag-list-delete-tag-1-button'))

    expect(screen.getByTestId('tag-list-delete-tag-1-consequence').textContent).toBe(
      'Removes the tag from its cards and topics',
    )
    expect(deleteTag).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('tag-list-delete-tag-1-confirm'))

    await waitFor(() => expect(deleteTag).toHaveBeenCalledWith({ data: 'tag-1' }))
  })

  it('should show an alert when the delete fails', async () => {
    vi.mocked(deleteTag).mockRejectedValue(new Error('boom'))
    renderWithClient(<TagDeleteControl tag={tag} />)

    await waitFor(() =>
      expect((screen.getByTestId('tag-list-delete-tag-1-button') as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(screen.getByTestId('tag-list-delete-tag-1-button'))
    fireEvent.click(screen.getByTestId('tag-list-delete-tag-1-confirm'))

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't do that, try again")
  })
})
