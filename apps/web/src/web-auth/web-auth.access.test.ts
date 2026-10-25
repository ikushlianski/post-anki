import { describe, expect, it } from 'vitest'

import { decideWebAccess, isPublicWebPath } from './web-auth.access'

const base = { method: 'GET', pathname: '/', production: true } as const

describe('decideWebAccess', () => {
  it('should send a signed-out visitor opening a page to the login page', () => {
    expect(decideWebAccess({ ...base, state: 'signed_out' })).toEqual({
      kind: 'redirect',
      to: '/login',
    })
  })

  it('should refuse a signed-out server function call with 401 instead of a redirect', () => {
    expect(
      decideWebAccess({ ...base, state: 'signed_out', method: 'POST', pathname: '/_serverFn/abc' }),
    ).toEqual({ kind: 'unauthorized' })
    expect(
      decideWebAccess({ ...base, state: 'signed_out', pathname: '/_serverFn/abc' }),
    ).toEqual({ kind: 'unauthorized' })
  })

  it('should refuse signed-out data routes such as the electric shape', () => {
    expect(
      decideWebAccess({ ...base, state: 'signed_out', pathname: '/api/electric-shape' }),
    ).toEqual({ kind: 'unauthorized' })
  })

  it('should refuse a signed-out write to a page path', () => {
    expect(decideWebAccess({ ...base, state: 'signed_out', method: 'POST' })).toEqual({
      kind: 'unauthorized',
    })
  })

  it('should let a signed-in owner through everywhere', () => {
    expect(decideWebAccess({ ...base, state: 'signed_in', pathname: '/_serverFn/abc' })).toEqual({
      kind: 'allow',
    })
  })

  it('should leave development open while sign-in is not configured', () => {
    expect(decideWebAccess({ ...base, state: 'unconfigured', production: false })).toEqual({
      kind: 'allow',
    })
  })

  it('should answer 503 in production while sign-in is not configured', () => {
    expect(decideWebAccess({ ...base, state: 'unconfigured' })).toEqual({ kind: 'unavailable' })
  })
})

describe('isPublicWebPath', () => {
  it('should keep the login page, the auth proxy and static assets open without a session', () => {
    expect(isPublicWebPath('/login')).toBe(true)
    expect(isPublicWebPath('/api/auth/sign-in/magic-link')).toBe(true)
    expect(isPublicWebPath('/assets/index-abc.js')).toBe(true)
  })

  it('should not open data routes or pages', () => {
    expect(isPublicWebPath('/api/electric-shape')).toBe(false)
    expect(isPublicWebPath('/_serverFn/abc')).toBe(false)
    expect(isPublicWebPath('/profile')).toBe(false)
    expect(isPublicWebPath('/login/extra')).toBe(false)
  })
})
