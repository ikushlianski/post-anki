// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Subject } from '../curriculum/model'
import { searchSubjects } from '../subject/subject.api'
import { DashboardSubjectSearch } from './dashboard-subject-search'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
    'data-testid'?: string
  }) => (
    <a href={`${to}?${JSON.stringify(params ?? {})}`} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../subject/subject.api')

function subject(id: string, name: string, parentId: string | null = null): Subject {
  return { id, name, kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId }
}

const PROGRAMMING = subject('sub-programming', 'Programming / Web Development')
const DATABASES = subject('sub-databases', 'Databases', PROGRAMMING.id)
const SUBJECTS: Subject[] = [subject('sub-business', 'Business'), PROGRAMMING, DATABASES]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function typeInto(value: string) {
  fireEvent.change(screen.getByTestId('subject-search-input'), { target: { value } })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DashboardSubjectSearch', () => {
  it('should not send a request before the typing pause of 250 ms', async () => {
    vi.mocked(searchSubjects).mockResolvedValue([])
    render(<DashboardSubjectSearch subjects={SUBJECTS} />)

    typeInto('data')
    await advance(249)

    expect(vi.mocked(searchSubjects)).not.toHaveBeenCalled()

    await advance(1)

    expect(vi.mocked(searchSubjects)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(searchSubjects)).toHaveBeenCalledWith({ data: 'data' })
  })

  it('should send one request for a burst of keystrokes', async () => {
    vi.mocked(searchSubjects).mockResolvedValue([])
    render(<DashboardSubjectSearch subjects={SUBJECTS} />)

    typeInto('d')
    await advance(100)
    typeInto('da')
    await advance(100)
    typeInto('dat')
    await advance(100)
    typeInto('data')
    await advance(250)

    expect(vi.mocked(searchSubjects)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(searchSubjects)).toHaveBeenCalledWith({ data: 'data' })
  })

  it('should render a returned subject even when its name does not contain the query', async () => {
    vi.mocked(searchSubjects).mockResolvedValue([DATABASES])
    render(<DashboardSubjectSearch subjects={SUBJECTS} />)

    typeInto('sql')
    await advance(250)

    expect(screen.getByTestId(`subject-search-result-${DATABASES.id}`)).toBeDefined()
    expect(screen.getByTestId(`subject-search-result-${DATABASES.id}`).textContent).toBe(
      'Programming / Web Development › Databases',
    )
  })

  it('should label a top-level match with its name alone', async () => {
    vi.mocked(searchSubjects).mockResolvedValue([subject('sub-business', 'Business')])
    render(<DashboardSubjectSearch subjects={SUBJECTS} />)

    typeInto('bus')
    await advance(250)

    expect(screen.getByTestId('subject-search-result-sub-business').textContent).toBe('Business')
  })

  it('should show an empty state naming the query when nothing matches', async () => {
    vi.mocked(searchSubjects).mockResolvedValue([])
    render(<DashboardSubjectSearch subjects={SUBJECTS} />)

    typeInto('zzz')
    await advance(250)

    expect(screen.getByTestId('subject-search-empty')).toBeDefined()
    expect(screen.getByTestId('subject-search-empty').textContent).toBe('No subjects match "zzz".')
  })

  it('should clear the query and report that the list should return on Escape', async () => {
    vi.mocked(searchSubjects).mockResolvedValue([DATABASES])
    const onSearchingChange = vi.fn()
    render(<DashboardSubjectSearch subjects={SUBJECTS} onSearchingChange={onSearchingChange} />)

    typeInto('data')
    await advance(250)
    expect(screen.getByTestId('subject-search-results')).toBeDefined()

    fireEvent.keyDown(screen.getByTestId('subject-search-input'), { key: 'Escape' })

    expect(screen.getByTestId<HTMLInputElement>('subject-search-input').value).toBe('')
    expect(screen.queryByTestId('subject-search-results')).toBeNull()
    expect(onSearchingChange).toHaveBeenLastCalledWith(false)
  })

  it('should ignore a response for an earlier query that arrives after a newer one', async () => {
    const slow = deferred<Subject[]>()
    const fast = deferred<Subject[]>()
    vi.mocked(searchSubjects).mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    render(<DashboardSubjectSearch subjects={SUBJECTS} />)

    typeInto('da')
    await advance(250)
    typeInto('dat')
    await advance(250)

    await act(async () => {
      fast.resolve([DATABASES])
    })
    await act(async () => {
      slow.resolve([PROGRAMMING])
    })

    expect(screen.getByTestId(`subject-search-result-${DATABASES.id}`)).toBeDefined()
    expect(screen.queryByTestId(`subject-search-result-${PROGRAMMING.id}`)).toBeNull()
  })
})
