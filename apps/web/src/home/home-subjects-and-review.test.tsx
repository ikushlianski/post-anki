// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('../knowledge-bit/anki-review-screen', () => ({
  AnkiReviewScreen: ({ scope }: { scope: Record<string, string> }) => (
    <div data-testid="review-screen" data-scope={JSON.stringify(scope)} />
  ),
}))

vi.mock('../knowledge-bit/knowledge-browser-subject-list', () => ({
  KnowledgeBrowserSubjectList: () => <div data-testid="subject-list" />,
}))

vi.mock('./home-options', () => ({
  HomeOptions: () => <div data-testid="options" />,
}))

import { HomeSubjectsAndReview } from './home-subjects-and-review'

afterEach(cleanup)

describe('HomeSubjectsAndReview', () => {
  it('should start reviewing all due cards without choosing a subject first', () => {
    render(<HomeSubjectsAndReview />)

    const review = screen.getByTestId('home-review')

    expect(within(review).getByTestId('review-screen').getAttribute('data-scope')).toBe('{}')
  })

  it('should show the subjects with their card counts next to the review', () => {
    render(<HomeSubjectsAndReview />)

    const subjects = screen.getByTestId('home-subjects')

    expect(within(subjects).getByText('Subjects')).toBeTruthy()
    expect(within(subjects).getByTestId('subject-list')).toBeTruthy()
  })

  it('should put the review options on the left and the subjects on the right', () => {
    render(<HomeSubjectsAndReview />)

    const left = screen.getByTestId('home-left')
    const right = screen.getByTestId('home-subjects')

    expect(within(left).getByTestId('options')).toBeTruthy()
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should name the home page Post Anki', () => {
    render(<HomeSubjectsAndReview />)

    expect(screen.getByRole('heading', { level: 1, name: 'Post Anki' })).toBeTruthy()
  })
})
