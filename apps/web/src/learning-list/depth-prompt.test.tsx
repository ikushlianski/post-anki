// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { DepthLevel } from '@post-anki/shared'

import { DepthPrompt } from './depth-prompt'

afterEach(cleanup)

function renderPrompt(electedDepth: DepthLevel | null) {
  const onElect = vi.fn().mockResolvedValue(undefined)

  render(
    <DepthPrompt
      topicTitle="Effects & Synchronization"
      electedDepth={electedDepth}
      onElect={onElect}
    />,
  )

  return { onElect }
}

describe('DepthPrompt', () => {
  it('should ask by name when no depth has been elected', () => {
    renderPrompt(null)

    expect(screen.getByTestId('depth-prompt').textContent).toContain(
      'Effects & Synchronization',
    )
  })

  it('should not ask again once a depth is elected', () => {
    renderPrompt('working')

    expect(screen.queryByTestId('depth-prompt')).toBeNull()
  })

  it('should elect the working rung for basics', async () => {
    const { onElect } = renderPrompt(null)

    fireEvent.click(screen.getByTestId('depth-choice-basics'))

    await waitFor(() => expect(onElect).toHaveBeenCalledWith('working'))
  })

  it('should elect the deep rung for advanced', async () => {
    const { onElect } = renderPrompt(null)

    fireEvent.click(screen.getByTestId('depth-choice-advanced'))

    await waitFor(() => expect(onElect).toHaveBeenCalledWith('deep'))
  })

  it('should label the choices with the shared depth intents', () => {
    renderPrompt(null)

    expect(
      screen.getByTestId('depth-choice-basics').dataset.depth,
    ).toBe('working')
    expect(
      screen.getByTestId('depth-choice-advanced').dataset.depth,
    ).toBe('deep')
  })
})
