import { describe, it, expect } from 'vitest'

import { safeHref } from './safe-href'

describe('safeHref', () => {
  it('passes through a normal https citation unchanged', () => {
    expect(safeHref('https://react.dev/learn/thinking-in-react')).toBe(
      'https://react.dev/learn/thinking-in-react',
    )
  })

  it('passes through a normal http citation unchanged', () => {
    expect(safeHref('http://example.com/post')).toBe('http://example.com/post')
  })

  it('rejects a javascript: URI so it can never become a clickable href', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
  })

  it('rejects a data: URI so it can never become a clickable href', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
  })

  it('rejects an address pointing at an internal or loopback host', () => {
    expect(safeHref('http://localhost/admin')).toBeUndefined()
    expect(safeHref('http://127.0.0.1/')).toBeUndefined()
  })

  it('treats a missing or empty url as unsafe rather than throwing', () => {
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref('')).toBeUndefined()
  })
})
