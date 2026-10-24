// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeBitFocusDone } from './knowledge-bit-focus-done'

afterEach(cleanup)

describe('KnowledgeBitFocusDone', () => {
  it('should tell the user all cards are decided and offer Finish triage', () => {
    const onFinish = vi.fn()

    render(<KnowledgeBitFocusDone waitingCount={0} decidedCount={3} onFinish={onFinish} />)

    expect(screen.getByRole('heading').textContent).toBe('All cards decided')
    expect(screen.getByText(/You went through 3 cards/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Finish triage' }))

    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('should say cards are still being written when some are waiting', () => {
    render(<KnowledgeBitFocusDone waitingCount={2} decidedCount={5} onFinish={vi.fn()} />)

    expect(screen.getByRole('heading').textContent).toBe('Writing more cards…')
    expect(screen.getByText(/2 suggestions are still being written/)).toBeTruthy()
  })

  it('should use singular wording for one waiting suggestion', () => {
    render(<KnowledgeBitFocusDone waitingCount={1} decidedCount={0} onFinish={vi.fn()} />)

    expect(screen.getByText(/1 suggestion is still being written/)).toBeTruthy()
  })
})
