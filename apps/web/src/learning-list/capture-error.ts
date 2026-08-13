import type { LearningListItemKind } from '@post-anki/shared'

const CAPTURE_ERROR_MESSAGE: Record<string, string> = {
  video_requires_description:
    'Nothing was captured. A video URL on its own has no text to learn from — paste the video description as well.',
  source_blocked:
    'Nothing was captured. That address is not allowed to be fetched, so the page was never read.',
  source_unreachable:
    'Nothing was captured. The page could not be reached — check the URL, or paste the text instead.',
  source_empty:
    'Nothing was captured. The page was reached but held no readable text.',
  invalid_input:
    'Nothing was captured. The URL or description was not accepted — check both and try again.',
  classification_failed:
    'The page was read but could not be classified. Nothing was added to the taxonomy.',
}

const FALLBACK_MESSAGE = 'Nothing was captured. The request was rejected.'

export function captureErrorMessage(
  code: string,
  message: string | null,
): string {
  const known = CAPTURE_ERROR_MESSAGE[code]

  if (known) {
    return known
  }

  return message && message.trim() !== '' ? message : FALLBACK_MESSAGE
}

export function isDescriptionRequired(
  kind: LearningListItemKind,
  description: string,
): boolean {
  return kind === 'video' && description.trim() === ''
}
