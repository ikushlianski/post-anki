// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AbandonPathControl } from './abandon-path-control'

afterEach(cleanup)

describe('AbandonPathControl', () => {
  it('should offer nothing for an already-completed path', () => {
    render(
      <AbandonPathControl
        pathId="path-1"
        status="completed"
        onAbandon={vi.fn()}
        onAbandoned={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('abandon-path-start')).toBeNull()
  })

  it('should offer nothing for an already-abandoned path', () => {
    render(
      <AbandonPathControl
        pathId="path-1"
        status="abandoned"
        onAbandon={vi.fn()}
        onAbandoned={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('abandon-path-start')).toBeNull()
  })

  it('should require an explicit confirm before abandoning an active path', () => {
    render(
      <AbandonPathControl
        pathId="path-1"
        status="active"
        onAbandon={vi.fn()}
        onAbandoned={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('abandon-path-start'))

    expect(screen.getByTestId('abandon-path-confirm').textContent).toContain(
      'Nothing is deleted',
    )
  })

  it('should call onAbandon then onAbandoned once confirmed', async () => {
    const onAbandon = vi.fn().mockResolvedValue({ ok: true, data: {} })
    const onAbandoned = vi.fn()

    render(
      <AbandonPathControl
        pathId="path-1"
        status="active"
        onAbandon={onAbandon}
        onAbandoned={onAbandoned}
      />,
    )

    fireEvent.click(screen.getByTestId('abandon-path-start'))
    fireEvent.click(screen.getByTestId('abandon-path-confirm-button'))

    await waitFor(() => expect(onAbandoned).toHaveBeenCalledTimes(1))
    expect(onAbandon).toHaveBeenCalledWith('path-1')
  })

  it('should let the user back out without abandoning', () => {
    render(
      <AbandonPathControl
        pathId="path-1"
        status="draft"
        onAbandon={vi.fn()}
        onAbandoned={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('abandon-path-start'))
    fireEvent.click(screen.getByTestId('abandon-path-cancel'))

    expect(screen.queryByTestId('abandon-path-confirm')).toBeNull()
  })
})
