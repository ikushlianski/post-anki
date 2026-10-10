// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { UnsortedDueBucket } from './unsorted-due-bucket'

afterEach(() => {
  cleanup()
})

describe('UnsortedDueBucket', () => {
  it('should show the unsorted due count when cards without a subject are due', () => {
    render(<UnsortedDueBucket dueCount={2} />)

    expect(screen.getByTestId('unsorted-due-bucket').textContent).toContain('Unsorted')
    expect(screen.getByTestId('unsorted-due-count').textContent).toBe('2 due')
  })

  it('should render nothing when no unsorted card is due', () => {
    render(<UnsortedDueBucket dueCount={0} />)

    expect(screen.queryByTestId('unsorted-due-bucket')).toBeNull()
  })
})
