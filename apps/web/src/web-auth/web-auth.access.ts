import type { WebAuthState } from '@post-anki/shared'

export type WebAccessDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; to: string }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }

export interface WebAccessInput {
  method: string
  pathname: string
  state: WebAuthState
  production: boolean
}

const PUBLIC_PREFIXES = ['/api/auth/', '/assets/']
const PUBLIC_FILES = new Set([
  '/login',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
  '/manifest.json',
  '/robots.txt',
])

export function isPublicWebPath(pathname: string): boolean {
  return PUBLIC_FILES.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/_serverFn/') || pathname === '/api' || pathname.startsWith('/api/')
}

export function decideWebAccess({
  method,
  pathname,
  state,
  production,
}: WebAccessInput): WebAccessDecision {
  if (state === 'signed_in') {
    return { kind: 'allow' }
  }

  if (state === 'unconfigured') {
    return production ? { kind: 'unavailable' } : { kind: 'allow' }
  }

  const isPageRead = method === 'GET' && !isApiPath(pathname)

  return isPageRead ? { kind: 'redirect', to: '/login' } : { kind: 'unauthorized' }
}
