// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Subject } from '../curriculum/model'
import { reorderSubjects } from '../subject/subject.api'
import { SortableSubjectGroup } from './sortable-subject-group'

vi.mock('../subject/subject.api')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const PARENT_ID = 'sub-parent'

function subject(id: string, name: string): Subject {
  return {
    id,
    name,
    kind: 'architecture-mentor',
    requireSources: false,
    modelTier: null,
    parentId: PARENT_ID,
  }
}

const SIBLINGS: Subject[] = [subject('sub-a', 'Alpha'), subject('sub-b', 'Beta')]

function makeRect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    bottom: top + height,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function mockRowRects() {
  const rects: Record<string, DOMRect> = {
    'row-sub-a': makeRect(0, 0, 200, 40),
    'row-sub-b': makeRect(50, 0, 200, 40),
  }

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const testId = this.getAttribute('data-testid')

    return testId && rects[testId] ? rects[testId] : makeRect(0, 0, 0, 0)
  })
}

function renderGroup(siblings: Subject[] = SIBLINGS, onOrderSaved = vi.fn()) {
  render(
    <SortableSubjectGroup
      parentId={PARENT_ID}
      siblings={siblings}
      onOrderSaved={onOrderSaved}
      renderRow={(row, handle) => (
        <li
          ref={handle.rowRef}
          style={handle.rowStyle}
          data-testid={`row-${row.id}`}
        >
          <button
            type="button"
            data-testid={`handle-${row.id}`}
            aria-label={`Drag ${row.name}`}
            {...handle.attributes}
            {...handle.listeners}
          >
            {row.name}
          </button>
        </li>
      )}
    />,
  )

  return onOrderSaved
}

function renderedOrder(): string[] {
  return screen.getAllByTestId(/^row-/).map((row) => row.getAttribute('data-testid') ?? '')
}

function dragTo(handle: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.pointerDown(handle, { clientX: from.x, clientY: from.y, button: 0, isPrimary: true, pointerId: 1 })
  fireEvent.pointerMove(document, { clientX: to.x, clientY: to.y, button: 1, isPrimary: true, pointerId: 1 })
  fireEvent.pointerMove(document, { clientX: to.x, clientY: to.y, button: 1, isPrimary: true, pointerId: 1 })
  fireEvent.pointerUp(document, { clientX: to.x, clientY: to.y, button: 0, isPrimary: true, pointerId: 1 })
}

async function settleAfterDrag() {
  await new Promise((resolve) => setTimeout(resolve, 70))
}

describe('SortableSubjectGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRowRects()
    vi.mocked(reorderSubjects).mockResolvedValue({ reordered: 2 })
  })

  it('should save the new sibling order when a subject is moved with the keyboard', async () => {
    const onOrderSaved = renderGroup()
    const handle = screen.getByTestId('handle-sub-a')

    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await settleAfterDrag()
    fireEvent.keyDown(document.activeElement ?? handle, { code: 'ArrowDown', key: 'ArrowDown' })
    await settleAfterDrag()
    fireEvent.keyDown(document.activeElement ?? handle, { code: 'Space', key: ' ' })

    await waitFor(() => {
      expect(vi.mocked(reorderSubjects)).toHaveBeenCalledWith({
        data: { parentId: PARENT_ID, orderedIds: ['sub-b', 'sub-a'] },
      })
    })
    expect(renderedOrder()).toEqual(['row-sub-b', 'row-sub-a'])
    expect(onOrderSaved).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('reorder-error')).toBeNull()
  })

  it('should save the new sibling order when a subject is dragged with the pointer', async () => {
    renderGroup()

    dragTo(
      screen.getByTestId('handle-sub-a'),
      { x: 10, y: 20 },
      { x: 10, y: 120 },
    )
    await settleAfterDrag()

    await waitFor(() => {
      expect(vi.mocked(reorderSubjects)).toHaveBeenCalledWith({
        data: { parentId: PARENT_ID, orderedIds: ['sub-b', 'sub-a'] },
      })
    })
  })

  it('should restore the previous order and show an alert when the save fails', async () => {
    const onOrderSaved = renderGroup()
    vi.mocked(reorderSubjects).mockRejectedValueOnce(new Error('Save failed'))
    const handle = screen.getByTestId('handle-sub-a')

    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await settleAfterDrag()
    fireEvent.keyDown(document.activeElement ?? handle, { code: 'ArrowDown', key: 'ArrowDown' })
    await settleAfterDrag()
    fireEvent.keyDown(document.activeElement ?? handle, { code: 'Space', key: ' ' })

    expect(await screen.findByTestId('reorder-error')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toBe('Save failed')
    expect(renderedOrder()).toEqual(['row-sub-a', 'row-sub-b'])
    expect(onOrderSaved).not.toHaveBeenCalled()
  })
})
