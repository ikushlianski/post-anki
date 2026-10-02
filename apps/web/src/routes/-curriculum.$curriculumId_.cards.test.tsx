// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

import { Route } from './curriculum.$curriculumId_.cards'

const mockUseSearch = vi.hoisted(() => vi.fn(() => ({ search: '' })))
const mockUseNavigate = vi.hoisted(() => vi.fn())
const mockUseSuspenseQuery = vi.hoisted(
  () =>
    (query: Record<string, unknown>) => {
      const queryKey = query.queryKey as unknown[]
      if (queryKey[0] === 'curriculum') {
        return {
          data: {
            curriculum: { name: 'Test Curriculum' },
          },
        }
      }
      if (queryKey[0] === 'curriculum-cards-browser') {
        return {
          data: [
            {
              variantId: 'var_1',
              prompt: 'What is React?',
              answer: 'A JavaScript library for building UIs',
              concept: 'React',
              topicTitle: 'React Basics',
            },
            {
              variantId: 'var_2',
              prompt: 'What is TypeScript?',
              answer: 'A typed superset of JavaScript',
              concept: 'TypeScript',
              topicTitle: 'TypeScript',
            },
          ],
        }
      }
      return { data: null }
    },
)

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...rest
  }: {
    children: ReactNode
    to?: string
    params?: Record<string, unknown>
    search?: Record<string, unknown>
  } & Record<string, unknown>) => (
    <a
      href="#"
      data-to={to}
      data-params={params ? JSON.stringify(params) : undefined}
      data-search={search ? JSON.stringify(search) : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ curriculumId: 'cur_1' }),
    useSearch: mockUseSearch,
    useNavigate: mockUseNavigate,
    useLoaderData: () => [
      {
        curriculum: { name: 'Test Curriculum' },
      },
      [
        {
          variantId: 'var_1',
          prompt: 'What is React?',
          answer: 'A JavaScript library for building UIs',
          concept: 'React',
          topicTitle: 'React Basics',
        },
        {
          variantId: 'var_2',
          prompt: 'What is TypeScript?',
          answer: 'A typed superset of JavaScript',
          concept: 'TypeScript',
          topicTitle: 'TypeScript',
        },
      ],
    ],
  }),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useSuspenseQuery: mockUseSuspenseQuery,
  }
})

describe('Route.validateSearch', () => {
  const validateSearch = (Route as unknown as {
    validateSearch: (search: Record<string, unknown>) => { search: string }
  }).validateSearch

  it('defaults to an empty string when no search param is provided', () => {
    expect(validateSearch({})).toEqual({ search: '' })
  })

  it('defaults to an empty string when search param is not a string', () => {
    expect(validateSearch({ search: 123 })).toEqual({ search: '' })
    expect(validateSearch({ search: null })).toEqual({ search: '' })
  })

  it('preserves the search string when provided', () => {
    expect(validateSearch({ search: 'React' })).toEqual({ search: 'React' })
  })

  it('preserves the search string even with special characters', () => {
    expect(validateSearch({ search: 'React & TypeScript' })).toEqual({
      search: 'React & TypeScript',
    })
  })
})

describe('CardsBrowserPage search URL state', () => {
  const CardsBrowserPage = (Route as unknown as { component: () => ReactNode }).component

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the search input with a value from Route.useSearch()', () => {
    mockUseSearch.mockReturnValue({ search: 'React' })

    render(<CardsBrowserPage />)

    const input = screen.getByTestId('cards-browser-search') as HTMLInputElement
    expect(input.value).toBe('React')
  })

  it('calls Route.useNavigate with updated search when input changes', async () => {
    mockUseSearch.mockReturnValue({ search: '' })
    const navigateMock = vi.fn()
    mockUseNavigate.mockReturnValue(navigateMock)

    const user = userEvent.setup()
    render(<CardsBrowserPage />)

    const input = screen.getByTestId('cards-browser-search')
    await user.type(input, 'R')

    expect(navigateMock).toHaveBeenCalledWith({
      search: { search: 'R' },
      replace: true,
    })
  })

  it('pre-filters cards based on search text from the URL', () => {
    mockUseSearch.mockReturnValue({ search: 'React' })

    render(<CardsBrowserPage />)

    expect(screen.getByTestId('cards-browser-row-var_1')).toBeDefined()
    expect(screen.queryByTestId('cards-browser-row-var_2')).toBeNull()
    expect(screen.getByTestId('cards-browser-count').textContent).toContain('1 of 2 cards')
  })

  it('shows all cards when search is empty', () => {
    mockUseSearch.mockReturnValue({ search: '' })

    render(<CardsBrowserPage />)

    expect(screen.getByTestId('cards-browser-row-var_1')).toBeDefined()
    expect(screen.getByTestId('cards-browser-row-var_2')).toBeDefined()
    expect(screen.getByTestId('cards-browser-count').textContent).toContain('2 of 2 cards')
  })

  it('shows no-matches message when search filters out all cards', () => {
    mockUseSearch.mockReturnValue({ search: 'NonexistentTopic' })

    render(<CardsBrowserPage />)

    expect(screen.getByTestId('cards-browser-no-matches').textContent).toContain(
      'No cards match "NonexistentTopic".',
    )
  })
})
