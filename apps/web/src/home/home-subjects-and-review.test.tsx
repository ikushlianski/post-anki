// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('../knowledge-bit/anki-review-screen', () => ({
  AnkiReviewScreen: ({ scope }: { scope: Record<string, string> }) => (
    <div data-testid="review-screen" data-scope={JSON.stringify(scope)} />
  ),
}))

vi.mock('../gamification/level-chip', () => ({
  LevelChip: () => <div data-testid="level-chip" />,
}))

vi.mock('../knowledge-source/add-knowledge-button', () => ({
  AddKnowledgeButton: () => <a data-testid="add-knowledge-button" href="/add-knowledge" />,
}))

import { HomeSubjectsAndReview } from './home-subjects-and-review'

afterEach(cleanup)

describe('HomeSubjectsAndReview', () => {
  it('should start reviewing all due cards without choosing a subject first', () => {
    render(<HomeSubjectsAndReview />)

    const review = screen.getByTestId('home-review')

    expect(within(review).getByTestId('review-screen').getAttribute('data-scope')).toBe('{}')
  })

  it('should leave the subject list and the quick options to their own pages', () => {
    render(<HomeSubjectsAndReview />)

    expect(screen.queryByTestId('home-subjects')).toBeNull()
    expect(screen.queryByTestId('home-options')).toBeNull()
  })

  it('should name the home page Post Anki', () => {
    render(<HomeSubjectsAndReview />)

    expect(screen.getByRole('heading', { level: 1, name: 'Post Anki' })).toBeTruthy()
  })

  it('should show the level chip under the page heading', () => {
    render(<HomeSubjectsAndReview />)

    const heading = screen.getByRole('heading', { level: 1, name: 'Post Anki' })

    expect(heading.compareDocumentPosition(screen.getByTestId('level-chip')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
