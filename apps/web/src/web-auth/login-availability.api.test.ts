import { describe, expect, it } from 'vitest'

import { readLoginOptions } from './login-availability.api'

describe('readLoginOptions', () => {
  it('should hide the email link unless the setting is exactly 1', () => {
    expect(readLoginOptions({})).toEqual({ magicLink: false })
    expect(readLoginOptions({ MAGIC_LINK_ENABLED: 'true' })).toEqual({ magicLink: false })
    expect(readLoginOptions({ MAGIC_LINK_ENABLED: '1' })).toEqual({ magicLink: true })
  })
})
