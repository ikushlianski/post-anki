export type MagicLinkOutcome = 'sent' | 'rate_limited' | 'failed'

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function requestMagicLink(email: string): Promise<MagicLinkOutcome> {
  try {
    const response = await postJson('/api/auth/sign-in/magic-link', {
      email,
      callbackURL: '/',
      errorCallbackURL: '/login',
    })

    if (response.status === 429) {
      return 'rate_limited'
    }

    return response.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function signOut(): Promise<boolean> {
  try {
    const response = await postJson('/api/auth/sign-out', {})

    if (!response.ok) {
      return false
    }
  } catch {
    return false
  }

  window.location.assign('/login')

  return true
}
