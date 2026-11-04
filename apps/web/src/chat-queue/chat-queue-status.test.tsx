// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ChatQueueStatus } from './chat-queue-status'

afterEach(cleanup)

describe('ChatQueueStatus', () => {
  it('should announce the loading text politely to screen readers', () => {
    render(<ChatQueueStatus state={{ status: 'loading' }} onRetry={vi.fn()} />)

    const loading = screen.getByTestId('chat-queue-loading')

    expect(loading.getAttribute('role')).toBe('status')
    expect(loading.getAttribute('aria-live')).toBe('polite')
  })

  it('should announce the empty Chat message politely', () => {
    render(<ChatQueueStatus state={{ status: 'ready', items: [] }} onRetry={vi.fn()} />)

    expect(screen.getByTestId('chat-queue-empty').getAttribute('role')).toBe('status')
  })

  it('should keep the load error as an alert', () => {
    render(<ChatQueueStatus state={{ status: 'error', message: 'Boom' }} onRetry={vi.fn()} />)

    expect(screen.getByTestId('chat-queue-load-error').getAttribute('role')).toBe('alert')
  })
})
