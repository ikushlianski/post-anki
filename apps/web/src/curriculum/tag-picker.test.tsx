// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { TagChip } from './model'
import { TagPicker } from './tag-picker'
import { assignTag, createOrGetTag, removeTagAssignment } from './curriculum.api'

// invalidate() resolves without changing anything and the `tags` prop stays
// exactly as rendered — so every assertion below is about what the component
// itself can show from the mutation's own response. If a refetch were allowed
// to supply the chip, these tests would pass with or without the fix.
const invalidate = vi.fn().mockResolvedValue(undefined)

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => ({
  createOrGetTag: vi.fn(),
  assignTag: vi.fn(),
  removeTagAssignment: vi.fn(),
}))

const mockedCreateOrGetTag = vi.mocked(createOrGetTag)
const mockedAssignTag = vi.mocked(assignTag)
const mockedRemoveTagAssignment = vi.mocked(removeTagAssignment)

const NODE_ID = 'mod-1'

function renderPicker(tags: TagChip[] = []) {
  return render(<TagPicker nodeType="module" nodeId={NODE_ID} tags={tags} editable />)
}

async function submitTagName(name: string) {
  fireEvent.click(screen.getByTestId(`tag-picker-open-${NODE_ID}`))
  fireEvent.change(screen.getByTestId(`tag-picker-input-${NODE_ID}`), {
    target: { value: name },
  })

  await act(async () => {
    fireEvent.click(screen.getByTestId(`tag-picker-submit-${NODE_ID}`))
  })
}

describe('TagPicker live refresh', () => {
  beforeEach(() => {
    invalidate.mockClear()
    mockedCreateOrGetTag.mockReset()
    mockedAssignTag.mockReset()
    mockedRemoveTagAssignment.mockReset()

    mockedCreateOrGetTag.mockResolvedValue({
      id: 'tag-1',
      name: 'Caching',
      normalizedName: 'caching',
    })
    mockedAssignTag.mockResolvedValue({
      id: 'tga-1',
      tagId: 'tag-1',
      nodeType: 'module',
      nodeId: NODE_ID,
      createdAt: '2026-08-01T00:00:00.000Z',
    })
    mockedRemoveTagAssignment.mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the newly assigned chip without any reload or refetch supplying it', async () => {
    renderPicker([])

    await submitTagName('Caching')

    await waitFor(() => {
      expect(screen.getByTestId('tag-chip-tag-1')).toBeDefined()
    })

    expect(screen.getByTestId('tag-chip-tag-1').textContent).toContain('Caching')
    expect(mockedAssignTag).toHaveBeenCalledWith({
      data: { tagId: 'tag-1', nodeType: 'module', nodeId: NODE_ID },
    })
  })

  it('keeps the chip visible when the route data comes back still not listing it', async () => {
    const { rerender } = renderPicker([])

    await submitTagName('Caching')

    await waitFor(() => {
      expect(screen.getByTestId('tag-chip-tag-1')).toBeDefined()
    })

    rerender(<TagPicker nodeType="module" nodeId={NODE_ID} tags={[]} editable />)

    expect(screen.getByTestId('tag-chip-tag-1')).toBeDefined()
  })

  it('does not render the chip twice once the route data catches up', async () => {
    const { rerender } = renderPicker([])

    await submitTagName('Caching')

    await waitFor(() => {
      expect(screen.getByTestId('tag-chip-tag-1')).toBeDefined()
    })

    rerender(
      <TagPicker
        nodeType="module"
        nodeId={NODE_ID}
        tags={[
          { id: 'tag-1', name: 'Caching', normalizedName: 'caching', assignmentId: 'tga-1' },
        ]}
        editable
      />,
    )

    expect(screen.getAllByTestId('tag-chip-tag-1')).toHaveLength(1)
  })

  it('hides a removed chip immediately even though the route data still lists it', async () => {
    renderPicker([
      { id: 'tag-9', name: 'Legacy', normalizedName: 'legacy', assignmentId: 'tga-9' },
    ])

    await act(async () => {
      fireEvent.click(screen.getByTestId('tag-chip-remove-tag-9'))
    })

    await waitFor(() => {
      expect(screen.queryByTestId('tag-chip-tag-9')).toBeNull()
    })
  })
})
