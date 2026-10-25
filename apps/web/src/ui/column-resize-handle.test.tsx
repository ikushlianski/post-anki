// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ColumnResizeHandle } from './column-resize-handle'

afterEach(cleanup)

function renderHandle(onResize = vi.fn()) {
  render(<ColumnResizeHandle label="Question" width={200} onResize={onResize} />)

  return onResize
}

describe('ColumnResizeHandle', () => {
  it('should be a vertical separator named after its column', () => {
    renderHandle()

    const handle = screen.getByRole('separator', { name: 'Resize Question column' })

    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('should widen the column with the right arrow key', async () => {
    const onResize = renderHandle()

    screen.getByRole('separator').focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(onResize).toHaveBeenCalledWith(216)
  })

  it('should narrow the column with the left arrow key', async () => {
    const onResize = renderHandle()

    screen.getByRole('separator').focus()
    await userEvent.keyboard('{ArrowLeft}')

    expect(onResize).toHaveBeenCalledWith(184)
  })

  it('should follow the pointer while dragging and stop after release', () => {
    const onResize = renderHandle()
    const handle = screen.getByRole('separator')

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 150, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 150, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 })

    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenCalledWith(250)
  })
})
