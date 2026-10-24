export interface ShortenedExcerpt {
  text: string
  shortened: boolean
}

function cutAtWordBoundary(text: string, maxChars: number): string {
  const head = text.slice(0, maxChars)
  const lastSpace = head.search(/\s\S*$/)

  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd()
}

export function shortenExcerpt(text: string, maxChars: number): ShortenedExcerpt {
  const trimmed = text.trim()

  if (trimmed.length <= maxChars) {
    return { text: trimmed, shortened: false }
  }

  const paragraphs = trimmed.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const kept: string[] = []
  let length = 0

  for (const paragraph of paragraphs) {
    const next = length + (kept.length > 0 ? 2 : 0) + paragraph.length

    if (next > maxChars) {
      break
    }

    kept.push(paragraph)
    length = next
  }

  if (kept.length > 0) {
    return { text: kept.join('\n\n'), shortened: true }
  }

  return { text: cutAtWordBoundary(trimmed, maxChars), shortened: true }
}
