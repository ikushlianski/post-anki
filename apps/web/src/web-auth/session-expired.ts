export const SESSION_EXPIRED_PATH = '/login?expired=1'

interface FetchHost {
  fetch: typeof fetch
  location: { pathname: string; assign: (url: string) => void }
}

function isServerFnUrl(input: Parameters<typeof fetch>[0]): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  return raw.includes('/_serverFn/')
}

export function installSessionExpiredRedirect(host: FetchHost): () => void {
  const original = host.fetch
  let redirected = false

  host.fetch = async (input, init) => {
    const response = await original(input, init)

    if (response.status === 401 && isServerFnUrl(input) && !redirected && host.location.pathname !== '/login') {
      redirected = true
      host.location.assign(SESSION_EXPIRED_PATH)
    }

    return response
  }

  return () => {
    host.fetch = original
  }
}
