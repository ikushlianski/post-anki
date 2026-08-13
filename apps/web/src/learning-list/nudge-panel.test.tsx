// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { DailyPushNudge } from '@post-anki/shared'

import { NudgePanel } from './nudge-panel'

afterEach(cleanup)

const nudge: DailyPushNudge = {
  entityType: 'learning_list_item',
  entityId: 'item-1',
  name: 'Security for agentic AI on AWS',
  score: 3,
  related: [
    {
      entityType: 'curriculum',
      entityId: 'cur-1',
      name: 'React Native',
      score: 2,
    },
  ],
}

function renderPanel(
  overrides: Partial<DailyPushNudge> = {},
  result: unknown = { ok: true, data: {} },
) {
  const onRespond = vi.fn().mockResolvedValue(result)
  const onResponded = vi.fn()

  render(
    <NudgePanel
      nudge={{ ...nudge, ...overrides }}
      onRespond={onRespond}
      onResponded={onResponded}
    />,
  )

  return { onRespond, onResponded }
}

describe('NudgePanel', () => {
  it('should name the item rather than asking generically', () => {
    renderPanel()

    expect(screen.getByTestId('nudge-name').textContent).toBe(
      'Security for agentic AI on AWS',
    )
  })

  it('should surface the related items going quiet alongside it', () => {
    renderPanel()

    expect(screen.getByTestId('nudge-related').textContent).toContain(
      'React Native',
    )
  })

  it('should omit the related line when there is nothing similar', () => {
    renderPanel({ related: [] })

    expect(screen.queryByTestId('nudge-related')).toBeNull()
  })

  it('should revive the item on yes', async () => {
    const { onRespond, onResponded } = renderPanel()

    fireEvent.click(screen.getByTestId('nudge-yes'))

    await waitFor(() => expect(onResponded).toHaveBeenCalled())
    expect(onRespond).toHaveBeenCalledWith({
      entityType: 'learning_list_item',
      entityId: 'item-1',
      response: 'yes',
    })
    expect(screen.getByTestId('nudge-outcome').textContent).toContain(
      'where it stopped',
    )
  })

  it('should set the item aside on no without deleting anything', async () => {
    const { onRespond } = renderPanel()

    fireEvent.click(screen.getByTestId('nudge-no'))

    const outcome = await screen.findByTestId('nudge-outcome')

    expect(onRespond.mock.calls[0][0].response).toBe('no')
    expect(outcome.textContent).toContain('nothing was deleted')
  })

  it('should answer a paused curriculum nudge on the same surface', async () => {
    const { onRespond } = renderPanel({
      entityType: 'curriculum',
      entityId: 'cur-9',
      name: 'React Native',
      related: [],
    })

    fireEvent.click(screen.getByTestId('nudge-yes'))

    await waitFor(() =>
      expect(onRespond).toHaveBeenCalledWith({
        entityType: 'curriculum',
        entityId: 'cur-9',
        response: 'yes',
      }),
    )
  })

  it('should report a failed answer instead of pretending it worked', async () => {
    renderPanel({}, { ok: false, status: 404, code: 'not_found', message: null })

    fireEvent.click(screen.getByTestId('nudge-yes'))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'not recorded',
    )
  })
})
