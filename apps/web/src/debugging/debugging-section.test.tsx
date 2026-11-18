// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { CopyCardIdButton } from './copy-card-id-button'
import { DebuggingSection } from './debugging-section'
import { SHOW_CARD_IDS_STORAGE_KEY } from './show-card-ids-preference'

function Both() {
  return (
    <>
      <DebuggingSection />
      <CopyCardIdButton id="card-123" />
    </>
  )
}

describe('card id debugging', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    window.localStorage.clear()
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(cleanup)

  it('should hide the copy button until the learner turns on Show card ids', () => {
    render(<CopyCardIdButton id="card-123" />)

    expect(screen.queryByTestId('copy-card-id')).toBeNull()
  })

  it('should show the copy button on a device where the learner turned the setting on', () => {
    window.localStorage.setItem(SHOW_CARD_IDS_STORAGE_KEY, 'on')

    render(<CopyCardIdButton id="card-123" />)

    expect(screen.getByTestId('copy-card-id')).toBeTruthy()
  })

  it('should remember the toggle on this device', () => {
    render(<DebuggingSection />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show card ids' }))

    expect(window.localStorage.getItem(SHOW_CARD_IDS_STORAGE_KEY)).toBe('on')
  })

  it('should put the exact card id on the clipboard so the learner can quote it', async () => {
    window.localStorage.setItem(SHOW_CARD_IDS_STORAGE_KEY, 'on')

    render(<Both />)
    fireEvent.click(screen.getByTestId('copy-card-id'))

    expect(await screen.findByText('Copied')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('card-123')
  })

  it('should tell the learner when the clipboard is unavailable', async () => {
    window.localStorage.setItem(SHOW_CARD_IDS_STORAGE_KEY, 'on')
    writeText.mockRejectedValueOnce(new Error('denied'))

    render(<CopyCardIdButton id="card-123" />)
    fireEvent.click(screen.getByTestId('copy-card-id'))

    expect(await screen.findByText('Copy failed')).toBeTruthy()
  })

  it('should stay off when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(<CopyCardIdButton id="card-123" />)

    expect(screen.queryByTestId('copy-card-id')).toBeNull()
    vi.restoreAllMocks()
  })
})
