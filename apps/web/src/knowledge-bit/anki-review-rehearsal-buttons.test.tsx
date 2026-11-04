// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { AnkiReviewRehearsalButtons, AnkiReviewRehearsalLabel } from './anki-review-rehearsal-buttons'

describe('AnkiReviewRehearsalButtons', () => {
  afterEach(cleanup)

  it('should grade Got it as good and Missed it as again', () => {
    const onGrade = vi.fn()

    render(<AnkiReviewRehearsalButtons disabled={false} onGrade={onGrade} />)
    fireEvent.click(screen.getByText('Got it'))
    fireEvent.click(screen.getByText('Missed it'))

    expect(onGrade.mock.calls).toEqual([['good'], ['again']])
  })

  it('should tell the learner this is the same idea in new wording', () => {
    render(<AnkiReviewRehearsalLabel />)

    expect(screen.getByText('Same idea, new wording')).toBeTruthy()
  })
})
