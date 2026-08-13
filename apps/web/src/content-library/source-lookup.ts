import type { LibrarySource } from '@post-anki/shared'

export function buildSourceLookup(sources: LibrarySource[]): Record<string, LibrarySource> {
  const lookup: Record<string, LibrarySource> = {}

  for (const source of sources) {
    lookup[source.id] = source
  }

  return lookup
}

export function sourceDisplayLabel(source: LibrarySource | undefined): string {
  if (!source) {
    return 'Unknown source'
  }

  return source.title ?? source.value
}
