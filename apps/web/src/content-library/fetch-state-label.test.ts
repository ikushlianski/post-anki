import { describe, expect, it } from 'vitest'

import { fetchStateLabel } from './fetch-state-label'

describe('fetchStateLabel', () => {
  it('labels a never-attempted source distinctly from a failed one', () => {
    expect(fetchStateLabel('never_fetched')).toBe('Never fetched')
    expect(fetchStateLabel('stale_failed')).toBe('Fetch failed')
  })

  it('labels a successfully fetched source', () => {
    expect(fetchStateLabel('fetched')).toBe('Fetched')
  })
})
