// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { DestinationChoice } from './destination-choice'

afterEach(cleanup)

function renderChoice(
  onChoose = vi.fn().mockResolvedValue({ ok: true, data: {} }),
) {
  const onChosen = vi.fn()

  render(
    <DestinationChoice itemId="item-1" onChoose={onChoose} onChosen={onChosen} />,
  )

  return { onChoose, onChosen }
}

describe('DestinationChoice', () => {
  it('should tell the user it was unsure rather than pretending it decided', () => {
    renderChoice()

    expect(screen.getByTestId('destination-choice').textContent).toContain(
      'could not tell',
    )
  })

  it('should direct a parked item to become a mini-course', async () => {
    const { onChoose, onChosen } = renderChoice()

    fireEvent.click(screen.getByTestId('destination-choice-mini-course'))

    await waitFor(() => expect(onChosen).toHaveBeenCalled())
    expect(onChoose).toHaveBeenCalledWith({
      itemId: 'item-1',
      destination: 'mini_course',
    })
  })

  it('should direct a parked item to fold into its Area', async () => {
    const { onChoose, onChosen } = renderChoice()

    fireEvent.click(screen.getByTestId('destination-choice-fold-in'))

    await waitFor(() => expect(onChosen).toHaveBeenCalled())
    expect(onChoose).toHaveBeenCalledWith({
      itemId: 'item-1',
      destination: 'fold_in',
    })
  })

  it('should surface a rejected choice instead of failing silently', async () => {
    const onChoose = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      code: 'not_parked',
      message: null,
    })
    renderChoice(onChoose)

    fireEvent.click(screen.getByTestId('destination-choice-mini-course'))

    expect(
      (await screen.findByTestId('destination-choice-error')).textContent,
    ).toContain('not_parked')
  })
})
