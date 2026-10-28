export type SignInOutcome = 'signed_in' | 'rate_limited' | 'failed'

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
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
