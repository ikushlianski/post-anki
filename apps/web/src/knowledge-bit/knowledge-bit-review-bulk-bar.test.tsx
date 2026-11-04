// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeBitReviewBulkBar } from './knowledge-bit-review-bulk-bar'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

function renderBar(isConfirming = false) {
  const handlers = { onRequestApproveAll: vi.fn(), onConfirmApproveAll: vi.fn(), onCancelApproveAll: vi.fn() }

  render(<KnowledgeBitReviewBulkBar readyCount={7} bulkMessage={null} isConfirming={isConfirming} {...handlers} />)

  return handlers
}

describe('KnowledgeBitReviewBulkBar', () => {
  afterEach(cleanup)

  it('should keep Approve all ready secondary and show how many cards it covers', () => {
    renderBar()

    const button = screen.getByTestId('knowledge-bit-review-approve-all')

    expect(button.textContent).toBe('Approve all ready (7)')
    expect(button.className).toBe(SECONDARY_BUTTON_CLASS)
    expect(button.className).not.toBe(PRIMARY_BUTTON_CLASS)
  })

  it('should ask for confirmation instead of approving on the first click', () => {
    const handlers = renderBar()

    fireEvent.click(screen.getByTestId('knowledge-bit-review-approve-all'))

    expect(handlers.onRequestApproveAll).toHaveBeenCalledTimes(1)
    expect(handlers.onConfirmApproveAll).not.toHaveBeenCalled()
  })
})
