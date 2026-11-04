// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

import { LearningPathLoadError } from './learning-path-load-error'

afterEach(cleanup)

describe('LearningPathLoadError', () => {
  it('should say not found only for a 404', () => {
    render(<LearningPathLoadError status={404} onRetry={vi.fn()} />)

    expect(screen.getByTestId('learning-path-not-found')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should offer Try again as an alert for any other failure', () => {
    const onRetry = vi.fn()

    render(<LearningPathLoadError status={503} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load this path")
    expect(screen.queryByTestId('learning-path-not-found')).toBeNull()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
