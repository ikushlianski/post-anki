// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeBrowserSlideOver } from './knowledge-browser-slide-over'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.style.overflow = ''
})

function renderWithRow(onClose = vi.fn(), getReturnFocus?: () => HTMLElement | null) {
  const view = render(
    <div>
      <table>
        <tbody>
          <tr data-testid="knowledge-browser-row" tabIndex={0}>
            <td>Row text</td>
          </tr>
        </tbody>
      </table>
      <p data-testid="page-background">Page</p>
      <KnowledgeBrowserSlideOver title="Indexes" onClose={onClose} getReturnFocus={getReturnFocus}>
        <p>Panel content</p>
      </KnowledgeBrowserSlideOver>
    </div>,
  )

  return { ...view, onClose }
}

describe('knowledge browser slide-over', () => {
  it('should show the title, the content and a close button without any edit control', () => {
    renderWithRow()

    expect(screen.getByRole('dialog', { name: 'Indexes' })).toBeTruthy()
    expect(screen.getByText('Panel content')).toBeTruthy()
    expect(screen.getByTestId('knowledge-browser-slide-over-close')).toBeTruthy()
  })

  it('should close when the owner presses Escape', () => {
    const { onClose } = renderWithRow()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close when the owner clicks the close button', () => {
    const { onClose } = renderWithRow()

    fireEvent.click(screen.getByTestId('knowledge-browser-slide-over-close'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close when the owner clicks outside the panel', () => {
    const { onClose } = renderWithRow()

    fireEvent.mouseDown(screen.getByTestId('page-background'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should stay open when the owner clicks inside the panel', () => {
    const { onClose } = renderWithRow()

    fireEvent.mouseDown(screen.getByText('Panel content'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('should stay open when the owner clicks another table row so the piece can switch', () => {
    const { onClose } = renderWithRow()

    fireEvent.mouseDown(screen.getByText('Row text'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('should close once when the dimmed phone background is tapped', () => {
    const { onClose } = renderWithRow()
    const backdrop = screen.getByTestId('knowledge-browser-slide-over-backdrop')

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should close the panel before a selection handler sees Escape', () => {
    const clearSelection = vi.fn()

    function selectionLikeHandler(event: KeyboardEvent) {
      if (!event.defaultPrevented && event.key === 'Escape') {
        clearSelection()
      }
    }

    window.addEventListener('keydown', selectionLikeHandler)

    const { onClose, unmount } = renderWithRow()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(clearSelection).not.toHaveBeenCalled()

    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(clearSelection).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', selectionLikeHandler)
  })

  it('should ignore other keys', () => {
    const { onClose } = renderWithRow()

    fireEvent.keyDown(window, { key: 'a' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('should fill the width as a sheet on phones and a 28rem drawer on wide screens', () => {
    renderWithRow()

    const panel = screen.getByTestId('knowledge-browser-slide-over')

    expect(panel.className).toContain('w-full')
    expect(panel.className).toContain('sm:w-[28rem]')
    expect(screen.getByTestId('knowledge-browser-slide-over-backdrop').className).toContain(
      'sm:hidden',
    )
  })

  it('should lock page scroll on phones and release it on close', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    const { unmount } = renderWithRow()

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })

  it('should not lock page scroll on wide screens', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    renderWithRow()

    expect(document.body.style.overflow).toBe('')
  })

  it('should move focus into the panel on open', () => {
    renderWithRow()

    expect(document.activeElement).toBe(screen.getByTestId('knowledge-browser-slide-over'))
  })

  it('should return focus to the row on close', () => {
    function Host({ open }: { open: boolean }) {
      return (
        <div>
          <button type="button" data-testid="opener">
            Row
          </button>
          {open ? (
            <KnowledgeBrowserSlideOver
              title="Indexes"
              onClose={() => undefined}
              getReturnFocus={() => document.querySelector<HTMLElement>('[data-testid="opener"]')}
            >
              <p>Body</p>
            </KnowledgeBrowserSlideOver>
          ) : null}
        </div>
      )
    }

    const { rerender } = render(<Host open />)

    expect(document.activeElement).toBe(screen.getByTestId('knowledge-browser-slide-over'))

    rerender(<Host open={false} />)

    expect(document.activeElement).toBe(screen.getByTestId('opener'))
  })

  it('should fall back to the element focused before opening when no row is given', () => {
    const opener = document.createElement('button')

    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <KnowledgeBrowserSlideOver title="Indexes" onClose={() => undefined}>
        <p>Body</p>
      </KnowledgeBrowserSlideOver>,
    )

    expect(document.activeElement).not.toBe(opener)

    unmount()

    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
