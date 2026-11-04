import { describe, expect, it } from 'vitest'

import { pageHead, pageTitle } from './page-title'

describe('pageTitle', () => {
  it('should name the page before the app name', () => {
    expect(pageTitle('Inbox')).toBe('Inbox · Post Anki')
    expect(pageHead('Stats')().meta[0]).toEqual({ title: 'Stats · Post Anki' })
  })
})
