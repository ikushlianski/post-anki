import { describe, expect, it } from 'vitest'

import { buildNoteSearchParams } from './note-search-params'

describe('buildNoteSearchParams', () => {
  it('should return null for an empty query without touching filters', () => {
    expect(buildNoteSearchParams('', 'security', 'node-1')).toBeNull()
  })

  it('should return null for a whitespace-only query', () => {
    expect(buildNoteSearchParams('   ', '', '')).toBeNull()
  })

  it('should trim the query and omit unset filters', () => {
    expect(buildNoteSearchParams('  idempotency  ', '', '')).toEqual({
      query: 'idempotency',
      concern: undefined,
      domainNodeId: undefined,
    })
  })

  it('should include concern and domainNodeId filters when set', () => {
    expect(buildNoteSearchParams('idempotency', 'security', 'node-1')).toEqual({
      query: 'idempotency',
      concern: 'security',
      domainNodeId: 'node-1',
    })
  })
})
