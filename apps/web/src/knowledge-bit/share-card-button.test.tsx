// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ShareCardButton } from './share-card-button'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const text = 'Q: What is 2+2?\nA: 4'

function stubNavigator(value: Record<string, unknown>) {
  vi.stubGlobal('navigator', value)
}

describe('share card button', () => {
  it('should hand the card text to the device share sheet when it exists', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    stubNavigator({ share, clipboard: { writeText } })
    render(<ShareCardButton text={text} />)

    await userEvent.click(screen.getByTestId('anki-review-share'))

    expect(share).toHaveBeenCalledWith({ text })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('should copy the card text and confirm when the device has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })
    render(<ShareCardButton text={text} />)

    await userEvent.click(screen.getByTestId('anki-review-share'))

    expect(writeText).toHaveBeenCalledWith(text)
    expect(screen.getByTestId('anki-review-share').textContent).toBe('Copied')
  })

  it('should say sharing failed when the share sheet errors', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(new Error('boom')) })
    render(<ShareCardButton text={text} />)

    await userEvent.click(screen.getByTestId('anki-review-share'))

    expect(screen.getByTestId('anki-review-share').textContent).toBe('Share failed')
  })

  it('should stay quiet when the learner cancels the share sheet', async () => {
    stubNavigator({ share: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')) })
    render(<ShareCardButton text={text} />)

    await userEvent.click(screen.getByTestId('anki-review-share'))

    expect(screen.getByTestId('anki-review-share').textContent).toBe('Share card')
  })
})
