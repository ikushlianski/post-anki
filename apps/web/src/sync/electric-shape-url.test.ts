import { describe, expect, it } from 'vitest'

import { electricShapeUrl } from './electric-shape-url'

describe('electricShapeUrl', () => {
  it('should give the sync client an absolute URL it can parse when rendering on the server', () => {
    const url = electricShapeUrl()

    expect(() => new URL(url)).not.toThrow()
    expect(new URL(url).pathname).toBe('/api/electric-shape')
  })

  it('should point at the current site origin when one is known', () => {
    expect(electricShapeUrl('http://localhost:5540')).toBe('http://localhost:5540/api/electric-shape')
  })
})
