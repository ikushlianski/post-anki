// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { OfflineBanner } from './offline-banner'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => {
  cleanup()
  setOnline(true)
})

describe('OfflineBanner', () => {
  it('should stay hidden online, appear as a status when offline and vanish on reconnect', () => {
    render(<OfflineBanner />)
    expect(screen.queryByTestId('offline-banner')).toBeNull()

    act(() => setOnline(false))
    expect(screen.getByTestId('offline-banner').getAttribute('role')).toBe('status')

    act(() => setOnline(true))
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })
})
