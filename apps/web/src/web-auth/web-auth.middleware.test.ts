import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
}))
vi.mock('./web-auth.api')

import { checkWebSession } from './web-auth.api'
import { webAuthMiddleware } from './web-auth.middleware'

type Handler = (args: { next: () => Promise<unknown>; request: Request }) => Promise<unknown>

const run = webAuthMiddleware as unknown as Handler
const next = vi.fn(async () => 'passed')

function call(path: string, method = 'GET') {
  return run({ next, request: new Request(`https://postanki.ilya.online${path}`, { method }) })
}

beforeEach(() => {
  next.mockClear()
})

describe('web auth middleware', () => {
  it('should refuse with 503 instead of letting anyone in when the session check fails', async () => {
    vi.mocked(checkWebSession).mockRejectedValue(new Error('api down'))

    const response = (await call('/profile')) as Response

    expect(response.status).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })

  it('should send a signed-in owner opening the login page to the home page', async () => {
    vi.mocked(checkWebSession).mockResolvedValue('signed_in')

    const response = (await call('/login')) as Response

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('should still show the login page when the session check fails', async () => {
    vi.mocked(checkWebSession).mockRejectedValue(new Error('api down'))

    expect(await call('/login')).toBe('passed')
  })
})
