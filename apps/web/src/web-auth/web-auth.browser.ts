export type MagicLinkOutcome = 'sent' | 'rate_limited' | 'failed'

export type SignInOutcome = 'signed_in' | 'rate_limited' | 'failed'

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

async function signIn(path: string, body: unknown): Promise<SignInOutcome> {
  try {
    const response = await postJson(path, body)

    if (response.status === 429) {
      return 'rate_limited'
    }

    if (!response.ok) {
      return 'failed'
    }
  } catch {
    return 'failed'
  }

  window.location.assign('/')

  return 'signed_in'
}

export function signInWithKey(key: string): Promise<SignInOutcome> {
  return signIn('/api/auth/sign-in/api-key', { key: key.trim() })
}

export function signInWithPassword(email: string, password: string): Promise<SignInOutcome> {
  return signIn('/api/auth/sign-in/email', { email: email.trim(), password })
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
