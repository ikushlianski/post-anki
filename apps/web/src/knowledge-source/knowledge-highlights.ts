import { KNOWLEDGE_HIGHLIGHTS_MAX, mergeHighlights } from '@post-anki/shared'
import type { KnowledgeHighlight } from '@post-anki/shared'

export { KNOWLEDGE_HIGHLIGHTS_MAX }
export type { KnowledgeHighlight }

export interface HighlightSegment {
  text: string
  marked: boolean
}

export function addHighlight(
  existing: KnowledgeHighlight[],
  range: KnowledgeHighlight,
  textLength: number,
): KnowledgeHighlight[] {
  const clamped = { start: Math.max(0, range.start), end: Math.min(textLength, range.end) }

  if (clamped.end <= clamped.start) {
    return existing
  }

  const merged = mergeHighlights([...existing, clamped])

  return merged.length > KNOWLEDGE_HIGHLIGHTS_MAX ? existing : merged
}

export function shiftHighlightsOnEdit(
  previous: string,
  next: string,
  highlights: KnowledgeHighlight[],
): KnowledgeHighlight[] {
  if (previous === next) {
    return highlights
  }

  const limit = Math.min(previous.length, next.length)
  let prefix = 0

  while (prefix < limit && previous[prefix] === next[prefix]) {
    prefix += 1
  }

  let suffix = 0

  while (suffix < limit - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) {
    suffix += 1
  }

  const editEnd = previous.length - suffix
  const delta = next.length - previous.length

  const nextEditEnd = next.length - suffix

  return highlights.flatMap((range) => {
    if (range.end <= prefix) {
      return [range]
    }

    if (range.start >= editEnd) {
      return [{ start: range.start + delta, end: range.end + delta }]
    }

    const coversStart = prefix <= range.start
    const coversEnd = editEnd >= range.end

    if (coversStart && coversEnd) {
      return []
    }

    if (coversStart) {
      return [{ start: nextEditEnd, end: range.end + delta }]
    }

    if (coversEnd) {
      return [{ start: range.start, end: prefix }]
    }

    return [{ start: range.start, end: range.end + delta }]
  })
}

export function trimHighlights(value: string, highlights: KnowledgeHighlight[] | undefined): KnowledgeHighlight[] {
  if (!highlights || highlights.length === 0) {
    return []
  }

  const leading = value.length - value.trimStart().length
  const length = value.trim().length

  return mergeHighlights(
    highlights.map((range) => ({
      start: Math.max(0, range.start - leading),
      end: Math.min(length, range.end - leading),
    })),
  )
}

export function highlightSegments(text: string, highlights: KnowledgeHighlight[]): HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let cursor = 0

  for (const range of mergeHighlights(highlights)) {
    const start = Math.min(range.start, text.length)
    const end = Math.min(range.end, text.length)

    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), marked: false })
    }

    if (end > start) {
      segments.push({ text: text.slice(start, end), marked: true })
    }

    cursor = Math.max(cursor, end)
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), marked: false })
  }

  return segments
}

export function highlightExcerpt(text: string, range: KnowledgeHighlight, maxChars = 40): string {
  const excerpt = text.slice(range.start, range.end).replace(/\s+/g, ' ').trim()

  return excerpt.length > maxChars ? `${excerpt.slice(0, maxChars)}…` : excerpt
}
