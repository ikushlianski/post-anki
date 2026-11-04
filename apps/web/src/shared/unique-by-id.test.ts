import { describe, expect, it } from 'vitest'

import { uniqueById } from './unique-by-id'

describe('uniqueById', () => {
  it('should drop a row repeated at the start of the next page and keep order', () => {
    const page1 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const page2 = [{ id: 'c' }, { id: 'd' }]

    expect(uniqueById([...page1, ...page2], (row) => row.id).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
