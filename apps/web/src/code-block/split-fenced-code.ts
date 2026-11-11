import { fencedCodeRanges } from '@post-anki/shared'

export type CardTextSegment = { kind: 'prose'; text: string } | { kind: 'code'; language: string | null; code: string }

const OPENING_FENCE = /^(`{3,})([^\n`]*)\r?\n/
const CLOSING_FENCE = /\r?\n`{3,}[ \t]*\r?$/

export function hasFencedCode(text: string | null | undefined): boolean {
  return Boolean(text) && fencedCodeRanges(text as string).length > 0
}

function parseBlock(block: string): CardTextSegment {
  const opening = OPENING_FENCE.exec(block)

  if (!opening) {
    return { kind: 'code', language: null, code: '' }
  }

  const language = (opening[2] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const code = block.slice(opening[0].length).replace(CLOSING_FENCE, '')

  return { kind: 'code', language: language || null, code }
}

export function splitFencedCode(text: string): CardTextSegment[] {
  const segments: CardTextSegment[] = []
  let cursor = 0

  for (const { start, end } of fencedCodeRanges(text)) {
    const prose = text.slice(cursor, start)

    if (prose) segments.push({ kind: 'prose', text: prose })

    segments.push(parseBlock(text.slice(start, end)))
    cursor = end
  }

  const rest = text.slice(cursor)

  if (rest) segments.push({ kind: 'prose', text: rest })

  return segments
}
