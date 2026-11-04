// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ChatQueueMakeCard } from './chat-queue-make-card'

function setup(overrides: Partial<Parameters<typeof ChatQueueMakeCard>[0]> = {}) {
  const props = {
    draft: { seq: 1, front: 'Q', back: 'A' },
    saving: false,
    error: null,
    onEdit: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }

  render(<ChatQueueMakeCard {...props} />)

  return props
}

describe('ChatQueueMakeCard', () => {
  afterEach(cleanup)

  it('should save when both sides are filled and cancel on request', () => {
    const props = setup()

    fireEvent.click(screen.getByTestId('chat-queue-make-card-save'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('should block saving when a side is empty or a save is in progress', () => {
    setup({ draft: { seq: 1, front: '  ', back: 'A' } })
    expect((screen.getByTestId('chat-queue-make-card-save') as HTMLButtonElement).disabled).toBe(true)

    cleanup()
    setup({ saving: true })
    expect((screen.getByTestId('chat-queue-make-card-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should pass edits up and announce an error', () => {
    const props = setup({ error: 'Nope' })

    fireEvent.change(screen.getByLabelText('Card front'), { target: { value: 'New' } })

    expect(props.onEdit).toHaveBeenCalledWith({ front: 'New' })
    expect(screen.getByTestId('chat-queue-make-card-error').getAttribute('role')).toBe('alert')
  })
})
