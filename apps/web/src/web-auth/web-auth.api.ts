import { webAuthCheckResultSchema } from '@post-anki/shared'
import type { WebAuthState } from '@post-anki/shared'

import { request } from '../curriculum/api-client'

const CHECK_TIMEOUT_MS = 5_000
const AUTH_COOKIE_PATTERN = /^(__Secure-|__Host-)?better-auth\./

export function authCookiesOnly(cookieHeader: string): string {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => AUTH_COOKIE_PATTERN.test(part))
    .join('; ')
}

export async function checkWebSession(cookie: string): Promise<WebAuthState> {
  const result = await request<unknown>('/web-auth/checks', {
    method: 'POST',
    body: { cookie: authCookiesOnly(cookie) },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  })

  return webAuthCheckResultSchema.parse(result).state
}
