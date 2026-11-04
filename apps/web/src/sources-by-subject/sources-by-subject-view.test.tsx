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
      { id: 'notion-n1', title: 'English Phrases', detail: 'Notion page', origin: 'notion', href: 'https://notion.so/p' },
    ],
  },
]

describe('SourcesBySubjectView', () => {
  it('should show each source under its subject heading with a link to open it', () => {
    render(<SourcesBySubjectView groups={groups} notionFailed={false} libraryFailed={false} />)

    expect(screen.getByRole('heading', { name: /English/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^English Phrases/ }).getAttribute('href')).toBe('https://notion.so/p')
  })

  it('should tell the owner there are no sources yet when nothing exists', () => {
    render(<SourcesBySubjectView groups={[]} notionFailed={false} libraryFailed={false} />)

    expect(screen.getByTestId('sources-empty')).toBeTruthy()
  })

  it('should show an error instead of an empty message when both lists fail to load', () => {
    render(<SourcesBySubjectView groups={[]} notionFailed libraryFailed />)

    expect(screen.getByTestId('sources-error')).toBeTruthy()
    expect(screen.queryByTestId('sources-empty')).toBeNull()
  })

  it('should warn that the list is incomplete when only one list fails but still show the rest', () => {
    render(<SourcesBySubjectView groups={groups} notionFailed={false} libraryFailed />)

    expect(screen.getByTestId('sources-partial-error').textContent).toContain('Library sources')
    expect(screen.getByText('English Phrases')).toBeTruthy()
  })

  it('should let the owner retry when both lists fail to load', () => {
    const onRetry = vi.fn()

    render(<SourcesBySubjectView groups={[]} notionFailed libraryFailed onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('should say subject paths are unavailable when the subject list failed', () => {
    render(<SourcesBySubjectView groups={groups} notionFailed={false} libraryFailed={false} subjectsFailed />)

    expect(screen.getByTestId('sources-subjects-failed').textContent).toContain('Subject paths unavailable')
  })

  it('should link the empty state to where sources are added', () => {
    render(<SourcesBySubjectView groups={[]} notionFailed={false} libraryFailed={false} />)

    expect(screen.getByRole('link', { name: 'Notion page' }).getAttribute('href')).toBe('/notion-sources')
    expect(screen.getByRole('link', { name: 'capture a link' }).getAttribute('href')).toBe('/add-knowledge')
  })

  it('should label each group by its heading, read its count in words and warn about new tabs', () => {
    render(<SourcesBySubjectView groups={groups} notionFailed={false} libraryFailed={false} />)

    expect(screen.getByRole('region', { name: /English/ })).toBeTruthy()
    expect(screen.getByText('1 source')).toBeTruthy()
    expect(screen.getByRole('link', { name: /opens in a new tab/ })).toBeTruthy()
  })
})
