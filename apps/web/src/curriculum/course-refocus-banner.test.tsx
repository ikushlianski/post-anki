// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CourseRefocusBanner } from './course-refocus-banner'
import type { CourseRefocusSuggestion } from './model'

vi.mock('./api-client', () => ({
  dismissCourseRefocusSuggestion: vi.fn().mockResolvedValue({ success: true }),
}))

describe('CourseRefocusBanner', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  function renderBanner(suggestions: CourseRefocusSuggestion[]) {
    return render(
      <QueryClientProvider client={queryClient}>
        <CourseRefocusBanner suggestions={suggestions} />
      </QueryClientProvider>,
    )
  }

  it('renders nothing when suggestions are empty', () => {
    const { container } = renderBanner([])
    expect(container.firstChild).toBeNull()
  })

  it('renders multiple suggestions including 2 from same subject', async () => {
    const suggestions: CourseRefocusSuggestion[] = [
      {
        curriculumId: 'c1',
        subjectId: 'subj1',
        subjectName: 'Database Design',
        courseName: 'Relational Database Fundamentals',
        reason: 'stale_top_priority',
        dismissedAt: null,
      },
      {
        curriculumId: 'c2',
        subjectId: 'subj1',
        subjectName: 'Database Design',
        courseName: 'Query Optimization',
        reason: 'stale_top_priority',
        dismissedAt: null,
      },
      {
        curriculumId: 'c3',
        subjectId: 'subj2',
        subjectName: 'System Design',
        courseName: 'Distributed Systems',
        reason: 'new_high_priority_ignored',
        dismissedAt: null,
      },
    ]

    renderBanner(suggestions)

    expect(screen.getByText('Relational Database Fundamentals')).toBeInTheDocument()
    expect(screen.getByText('Query Optimization')).toBeInTheDocument()
    expect(screen.getByText('Distributed Systems')).toBeInTheDocument()
  })

  it('removes card from view after dismissing', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const suggestions: CourseRefocusSuggestion[] = [
      {
        curriculumId: 'c1',
        subjectId: 'subj1',
        subjectName: 'Database Design',
        courseName: 'Relational Database Fundamentals',
        reason: 'stale_top_priority',
        dismissedAt: null,
      },
    ]

    renderBanner(suggestions)

    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissButton)

    await waitFor(() => {
      expect(screen.queryByText('Relational Database Fundamentals')).not.toBeInTheDocument()
    })
  })

  it('displays correct reason message for stale course', () => {
    const suggestions: CourseRefocusSuggestion[] = [
      {
        curriculumId: 'c1',
        subjectId: 'subj1',
        subjectName: 'Database Design',
        courseName: 'Relational Database Fundamentals',
        reason: 'stale_top_priority',
        dismissedAt: null,
      },
    ]

    renderBanner(suggestions)

    expect(screen.getByText(/haven't studied this course in a while/i)).toBeInTheDocument()
  })

  it('displays correct reason message for new course', () => {
    const suggestions: CourseRefocusSuggestion[] = [
      {
        curriculumId: 'c1',
        subjectId: 'subj1',
        subjectName: 'System Design',
        courseName: 'Distributed Systems',
        reason: 'new_high_priority_ignored',
        dismissedAt: null,
      },
    ]

    renderBanner(suggestions)

    expect(screen.getByText(/new, high-priority course/i)).toBeInTheDocument()
  })
})
