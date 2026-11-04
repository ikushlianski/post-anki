import { accountSchema, type Account } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'
import { authCookiesOnly } from '../web-auth/web-auth.api'

export async function fetchAccount(
  cookie: string,
  init?: { method: 'PATCH'; body: unknown },
): Promise<Account> {
  const headers = authHeaders()
  const authCookie = authCookiesOnly(cookie)

  if (authCookie) {
    headers.cookie = authCookie
  }

  const response = await fetch(`${apiBaseUrl()}/account`, {
    method: init?.method ?? 'GET',
    headers,
    body: init ? JSON.stringify(init.body) : undefined,
  })

  if (!response.ok) {
    throw new Error(`account request failed (${response.status})`)
  }

  return accountSchema.parse(await response.json())
}
