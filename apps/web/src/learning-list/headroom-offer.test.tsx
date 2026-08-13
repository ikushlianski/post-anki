// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { HeadroomOffer } from './headroom-offer'

afterEach(cleanup)

const NOW = '2026-08-07T10:00:00.000Z'

function renderOffer(
  overrides: Partial<React.ComponentProps<typeof HeadroomOffer>> = {},
) {
  const onAccept = vi.fn().mockResolvedValue(undefined)
  const onDecline = vi.fn()

  render(
    <HeadroomOffer
      electedDepth="working"
      mastered
      lastOfferAt={null}
      now={NOW}
      onAccept={onAccept}
      onDecline={onDecline}
      {...overrides}
    />,
  )

  return { onAccept, onDecline }
}

describe('HeadroomOffer', () => {
  it('should offer the advanced level for a topic mastered at basics', () => {
    renderOffer()

    expect(screen.getByTestId('headroom-offer').dataset.nextDepth).toBe('deep')
  })

  it('should stay silent until the topic is mastered', () => {
    renderOffer({ mastered: false })

    expect(screen.queryByTestId('headroom-offer')).toBeNull()
  })

  it('should raise the elected depth on acceptance', async () => {
    const { onAccept } = renderOffer()

    fireEvent.click(screen.getByTestId('headroom-accept'))

    await waitFor(() => expect(onAccept).toHaveBeenCalledWith('deep'))
  })

  it('should record the decline and promise not to re-ask tomorrow', () => {
    const { onDecline } = renderOffer()

    fireEvent.click(screen.getByTestId('headroom-decline'))

    expect(onDecline).toHaveBeenCalledWith(NOW)
    expect(screen.getByTestId('headroom-declined').textContent).toContain(
      'not come back tomorrow',
    )
  })

  it('should not re-offer the day after a decline', () => {
    renderOffer({ lastOfferAt: '2026-08-06T10:00:00.000Z' })

    expect(screen.queryByTestId('headroom-offer')).toBeNull()
  })

  it('should stay silent when the topic is already at the top depth', () => {
    renderOffer({ electedDepth: 'deep' })

    expect(screen.queryByTestId('headroom-offer')).toBeNull()
  })
})
