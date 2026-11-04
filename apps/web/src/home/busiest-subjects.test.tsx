// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SubjectReviewDueCounts } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? {})} {...rest}>
      {children}
    </a>
  ),
}))

import { BusiestSubjects } from './busiest-subjects'

afterEach(cleanup)

const SUBJECTS = [
  { id: 'a', name: 'Algebra', parentId: null },
  { id: 'b', name: 'Biology', parentId: null },
  { id: 'c', name: 'Chemistry', parentId: null },
]

const COUNTS: SubjectReviewDueCounts = {
  subjects: [
    { subjectId: 'a', dueCount: 3, newCount: 1 },
    { subjectId: 'b', dueCount: 8, newCount: 0 },
    { subjectId: 'c', dueCount: 0, newCount: 4 },
  ],
  unsorted: { dueCount: 0, newCount: 0 },
  newRemainingToday: 5,
}

describe('BusiestSubjects', () => {
  it('should list subjects busiest first, each Study button opening review for that subject', () => {
    render(<BusiestSubjects subjects={SUBJECTS} counts={{ ok: true, data: COUNTS }} />)

    const cards = screen.getAllByTestId('busiest-subject')

    expect(cards.map((card) => within(card).getByTestId('busiest-subject-name').textContent)).toEqual([
      'Biology',
      'Algebra',
    ])
    expect(within(cards[0]!).getByTestId('busiest-subject-study').getAttribute('data-search')).toBe(
      '{"subjectId":"b"}',
    )
    expect(within(cards[1]!).getByText('1 new')).toBeDefined()
  })

  it('should hide subjects with nothing due and show an empty message when no subject has anything due', () => {
    const empty = { ...COUNTS, subjects: COUNTS.subjects.map((row) => ({ ...row, dueCount: 0 })) }

    render(<BusiestSubjects subjects={SUBJECTS} counts={{ ok: true, data: empty }} />)

    expect(screen.queryAllByTestId('busiest-subject')).toHaveLength(0)
    expect(screen.getByTestId('busiest-subjects-empty')).toBeDefined()
  })

  it('should show an Unsorted card that studies everything when unsorted cards are due', () => {
    render(
      <BusiestSubjects
        subjects={SUBJECTS}
        counts={{ ok: true, data: { ...COUNTS, unsorted: { dueCount: 2, newCount: 0 } } }}
      />,
    )

    const card = screen.getByTestId('unsorted-due-bucket')

    expect(within(card).getByTestId('busiest-subject-due').textContent).toBe('2')
    expect(within(card).getByTestId('busiest-subject-study').getAttribute('data-search')).toBe('{}')
  })

  it('should link to the subjects page and render no tree, search box or quick-option menu', () => {
    render(<BusiestSubjects subjects={SUBJECTS} counts={{ ok: true, data: COUNTS }} />)

    expect(screen.getByText('See all subjects').getAttribute('href')).toBe('/subjects')
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('should show an inline message when the counts fail to load', () => {
    render(<BusiestSubjects subjects={SUBJECTS} counts={{ ok: false }} />)

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your review counts")
  })
})
