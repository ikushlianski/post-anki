import { buildSubjectPathLabel, type SubjectHierarchyRow } from '@post-anki/core'
import type { LibrarySource } from '@post-anki/shared'

const PATH_SEPARATOR = ' › '

export type SubjectSourceItem = {
  id: string
  title: string
  detail: string
  origin: 'library'
  href: string | null
}

export type SubjectSourceGroup = {
  subjectId: string
  subjectName: string
  items: SubjectSourceItem[]
}

function safeHttpUrl(value: string): string | null {
  try {
    const protocol = new URL(value).protocol

    return protocol === 'http:' || protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function fetchStateText(source: LibrarySource): string {
  if (source.fetchState === 'stale_failed') return 'download failed'

  if (source.fetchState === 'never_fetched') return 'not downloaded yet'

  return source.lastFetchedAt ? `downloaded ${source.lastFetchedAt.slice(0, 10)}` : 'downloaded'
}

function libraryItem(source: LibrarySource): SubjectSourceItem {
  const isLink = source.kind === 'link'

  return {
    id: `library-${source.id}`,
    title: source.title ?? source.value,
    detail: isLink
      ? `${source.kind} in ${source.curriculumName}, ${fetchStateText(source)}`
      : `${source.kind} in ${source.curriculumName}`,
    origin: 'library',
    href: isLink ? safeHttpUrl(source.value) : null,
  }
}

function pathLabel(
  subjectId: string,
  fallback: string,
  subjects: SubjectHierarchyRow[],
): string {
  return buildSubjectPathLabel(subjectId, subjects) || fallback
}

function compareLabels(a: string, b: string): number {
  const left = a.split(PATH_SEPARATOR)
  const right = b.split(PATH_SEPARATOR)

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const result = left[index].localeCompare(right[index])

    if (result !== 0) return result
  }

  return left.length - right.length
}

export function groupSourcesBySubject(
  librarySources: LibrarySource[],
  subjects: SubjectHierarchyRow[] = [],
): SubjectSourceGroup[] {
  const groups = new Map<string, SubjectSourceGroup>()

  function add(subjectId: string, fallbackLabel: string, item: SubjectSourceItem) {
    const group = groups.get(subjectId) ?? {
      subjectId,
      subjectName: pathLabel(subjectId, fallbackLabel, subjects),
      items: [],
    }

    group.items.push(item)
    groups.set(subjectId, group)
  }

  for (const source of librarySources) {
    add(source.subjectId, source.subjectName, libraryItem(source))
  }

  return [...groups.values()]
    .map((group) => ({ ...group, items: [...group.items].sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => compareLabels(a.subjectName, b.subjectName))
}
