// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { Route } from './notes'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useLoaderData: () => ({ subjects: [] }),
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
  }),
}))

describe('Route.validateSearch', () => {
  const validateSearch = (
    Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => { query: string }
    }
  ).validateSearch

  it('should default to an empty string when no query param is provided', () => {
    expect(validateSearch({}).query).toBe('')
  })

  it('should default to an empty string when the query param is not a string or number', () => {
    expect(validateSearch({ query: null }).query).toBe('')
  })

  it('should keep a plain-text query term', () => {
    expect(validateSearch({ query: 'React' }).query).toBe('React')
  })

  it('should keep a hand-typed numeric search term like ?query=2024 instead of dropping it', () => {
    expect(validateSearch({ query: 2024 }).query).toBe('2024')
  })
})
