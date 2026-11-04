// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NodeCommentControl } from './node-comment-control'

afterEach(cleanup)

function openAndType(onSubmit: (comment: string) => Promise<boolean>) {
  render(<NodeCommentControl busy={false} hydrated onSubmit={onSubmit} />)
  fireEvent.click(screen.getByText(/Leave a comment/))
  fireEvent.change(screen.getByPlaceholderText(/A note for later/), { target: { value: 'revisit this' } })
  fireEvent.click(screen.getByText('Save'))
}

describe('NodeCommentControl', () => {
  it('should keep the typed comment and show no success flash when saving fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)

    openAndType(onSubmit)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('revisit this'))
    expect((screen.getByPlaceholderText(/A note for later/) as HTMLInputElement).value).toBe('revisit this')
    expect(screen.queryByText('Comment saved')).toBeNull()
  })

  it('should clear the box and confirm when saving works', async () => {
    openAndType(vi.fn().mockResolvedValue(true))

    expect(await screen.findByText('Comment saved')).toBeTruthy()
  })
})
