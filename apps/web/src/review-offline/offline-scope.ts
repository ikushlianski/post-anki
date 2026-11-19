export function currentOfflineScope(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.origin.trim().toLowerCase().replace(/\/+$/, '')
}
