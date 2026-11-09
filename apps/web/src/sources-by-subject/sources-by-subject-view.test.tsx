// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

import { SourcesBySubjectView } from './sources-by-subject-view'
import type { SubjectSourceGroup } from './subject-source-group'

afterEach(cleanup)

const groups: SubjectSourceGroup[] = [
  {
    subjectId: 's1',
    subjectName: 'English',
    items: [
      { id: 'library-l1', title: 'English Phrases', detail: 'link in Curriculum', origin: 'library', href: 'https://example.com/p' },
    ],
  },
]

describe('SourcesBySubjectView', () => {
  it('should show each source under its subject heading with a link to open it', () => {
    render(<SourcesBySubjectView groups={groups} libraryFailed={false} />)

    expect(screen.getByRole('heading', { name: /English/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^English Phrases/ }).getAttribute('href')).toBe('https://example.com/p')
  })

  it('should tell the owner there are no sources yet when nothing exists', () => {
    render(<SourcesBySubjectView groups={[]} libraryFailed={false} />)

    expect(screen.getByTestId('sources-empty')).toBeTruthy()
  })

  it('should show an error instead of an empty message when the library fails to load', () => {
    render(<SourcesBySubjectView groups={[]} libraryFailed />)

    expect(screen.getByTestId('sources-error')).toBeTruthy()
    expect(screen.queryByTestId('sources-empty')).toBeNull()
  })

  it('should warn that the list is incomplete when the library fails but still show the rest', () => {
    render(<SourcesBySubjectView groups={groups} libraryFailed />)

    expect(screen.getByTestId('sources-partial-error').textContent).toContain('Library sources')
    expect(screen.getByText('English Phrases')).toBeTruthy()
  })

  it('should let the owner retry when the library fails to load', () => {
    const onRetry = vi.fn()

    render(<SourcesBySubjectView groups={[]} libraryFailed onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('should say subject paths are unavailable when the subject list failed', () => {
    render(<SourcesBySubjectView groups={groups} libraryFailed={false} subjectsFailed />)

    expect(screen.getByTestId('sources-subjects-failed').textContent).toContain('Subject paths unavailable')
  })

  it('should link the empty state to where sources are added', () => {
    render(<SourcesBySubjectView groups={[]} libraryFailed={false} />)

    expect(screen.getByRole('link', { name: 'Capture a link' }).getAttribute('href')).toBe('/add-knowledge')
  })

  it('should label each group by its heading, read its count in words and warn about new tabs', () => {
    render(<SourcesBySubjectView groups={groups} libraryFailed={false} />)

    expect(screen.getByRole('region', { name: /English/ })).toBeTruthy()
    expect(screen.getByText('1 source')).toBeTruthy()
    expect(screen.getByRole('link', { name: /opens in a new tab/ })).toBeTruthy()
  })
})
