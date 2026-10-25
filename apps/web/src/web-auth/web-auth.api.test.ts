import { describe, expect, it } from 'vitest'

import { authCookiesOnly } from './web-auth.api'

describe('authCookiesOnly', () => {
  it('should send only the sign-in cookies so an unrelated huge cookie cannot break the session check', () => {
    const header = `theme=dark; big=${'x'.repeat(9000)}; __Secure-better-auth.session_token=abc; better-auth.session_data=def`

    expect(authCookiesOnly(header)).toBe(
      '__Secure-better-auth.session_token=abc; better-auth.session_data=def',
    )
  })

  it('should send nothing when there is no sign-in cookie', () => {
    expect(authCookiesOnly('theme=dark')).toBe('')
  })
})
