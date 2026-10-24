// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'

import { useCardSelection } from './use-card-selection'

afterEach(cleanup)

function Harness({ enabled, resetKey = 'c1' }: { enabled: boolean; resetKey?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { selection } = useCardSelection(ref, enabled, resetKey)

  return (
    <div>
      <div ref={ref}>
        <p data-testid="inside">card answer text</p>
      </div>
      <p data-testid="outside">elsewhere</p>
      <output data-testid="captured">{selection}</output>
    </div>
  )
}

function select(testId: string) {
  const range = document.createRange()

  range.selectNodeContents(screen.getByTestId(testId))
  document.getSelection()?.removeAllRanges()
  document.getSelection()?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

describe('useCardSelection', () => {
  it('should capture text highlighted inside the card area once the answer is revealed', () => {
    render(<Harness enabled />)
    act(() => select('inside'))

    expect(screen.getByTestId('captured').textContent).toBe('card answer text')
  })

  it('should ignore text highlighted outside the card area', () => {
    render(<Harness enabled />)
    act(() => select('outside'))

    expect(screen.getByTestId('captured').textContent).toBe('')
  })

  it('should not capture anything before the answer is revealed', () => {
    render(<Harness enabled={false} />)
    act(() => select('inside'))

    expect(screen.getByTestId('captured').textContent).toBe('')
  })

  it('should drop the highlight when the learner moves to another card', () => {
    const { rerender } = render(<Harness enabled />)

    act(() => select('inside'))
    rerender(<Harness enabled resetKey="c2" />)

    expect(screen.getByTestId('captured').textContent).toBe('')
  })
})
