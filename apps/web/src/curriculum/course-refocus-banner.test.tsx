// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { CourseRefocusSuggestion } from './model'
import { CourseRefocusBanner } from './course-refocus-banner'
import { dismissCourseRefocusSuggestion } from './curriculum.api'

// cross-course-refocus-suggestion (issue #70) — SCENARIOS 4, 9, 12. Proves:
// N suggestions (including 2 from the same subject, Scenario 12) render N
// dismissible cards; clicking dismiss calls the dismiss mutation with the
// correct (curriculumId, reason) and removes only that card from local
// state (Scenario 4); an empty or failed suggestions list renders nothing —
// no error banner, no stuck loading spinner (Scenario 9). This component
// never fetches on its own — a failed fetch is already reduced to an empty
// array upstream by api-client.ts's getCourseRefocusSuggestions, so "failed
// list" and "empty list" are the same input here.

vi.mock('./curriculum.api', () => ({
  dismissCourseRefocusSuggestion: vi.fn(),
}))

const mockedDismiss = vi.mocked(dismissCourseRefocusSuggestion)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function suggestion(overrides: Partial<CourseRefocusSuggestion> = {}): CourseRefocusSuggestion {
  return {
    curriculumId: 'cur_1',
    subjectId: 'sub_1',
    curriculumName: 'Distributed Systems',
    subjectName: 'Backend Engineering',
    reason: 'stale_top_priority',
    daysSinceActivity: 20,
    ...overrides,
  }
}

describe('CourseRefocusBanner', () => {
  describe('SCENARIO 9 — the banner is non-blocking', () => {
    it('renders nothing for an empty suggestions list', () => {
      const { container } = render(<CourseRefocusBanner suggestions={[]} />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('SCENARIO 12 — multiple simultaneous stale courses in one subject render as separate cards', () => {
    it('renders one card per suggestion, including two from the same subject', () => {
      const suggestions = [
        suggestion({ curriculumId: 'cur_1' }),
        suggestion({ curriculumId: 'cur_2', curriculumName: 'Kubernetes Deep Dive' }),
        suggestion({
          curriculumId: 'cur_3',
          subjectId: 'sub_2',
          subjectName: 'Spanish',
          curriculumName: 'Spanish Grammar',
          reason: 'new_high_priority_ignored',
          daysSinceActivity: 3,
        }),
      ]

      render(<CourseRefocusBanner suggestions={suggestions} />)

      expect(screen.getByTestId('course-refocus-card-cur_1:stale_top_priority')).toBeDefined()
      expect(screen.getByTestId('course-refocus-card-cur_2:stale_top_priority')).toBeDefined()
      expect(
        screen.getByTestId('course-refocus-card-cur_3:new_high_priority_ignored'),
      ).toBeDefined()
    })
  })

  describe('SCENARIO 4 — dismissing a suggestion hides it, but not forever', () => {
    it('calls the dismiss mutation with the correct (curriculumId, reason) and removes only that card', async () => {
      mockedDismiss.mockResolvedValue(null)

      const suggestions = [
        suggestion({ curriculumId: 'cur_1' }),
        suggestion({ curriculumId: 'cur_2', curriculumName: 'Kubernetes Deep Dive' }),
      ]

      render(<CourseRefocusBanner suggestions={suggestions} />)

      fireEvent.click(screen.getByTestId('course-refocus-dismiss-cur_1:stale_top_priority'))

      await waitFor(() => {
        expect(
          screen.queryByTestId('course-refocus-card-cur_1:stale_top_priority'),
        ).toBeNull()
      })

      expect(screen.getByTestId('course-refocus-card-cur_2:stale_top_priority')).toBeDefined()

      expect(mockedDismiss).toHaveBeenCalledWith({
        data: { curriculumId: 'cur_1', reason: 'stale_top_priority' },
      })
    })

    it('keeps the card visible with an inline error when the dismiss mutation fails', async () => {
      mockedDismiss.mockRejectedValue(new Error('network error'))

      render(<CourseRefocusBanner suggestions={[suggestion({ curriculumId: 'cur_1' })]} />)

      fireEvent.click(screen.getByTestId('course-refocus-dismiss-cur_1:stale_top_priority'))

      await waitFor(() => {
        expect(
          screen.getByTestId('course-refocus-error-cur_1:stale_top_priority'),
        ).toBeDefined()
      })

      expect(screen.getByTestId('course-refocus-card-cur_1:stale_top_priority')).toBeDefined()
    })
  })
})
