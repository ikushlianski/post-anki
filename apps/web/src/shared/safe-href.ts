import { isSafeSourceUrl } from '@post-anki/core'

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined
  }

  return isSafeSourceUrl(url).allowed ? url : undefined
}
