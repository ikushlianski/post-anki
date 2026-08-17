const NOTE_CAPTURE_ERROR_MESSAGE: Record<string, string> = {
  invalid_input:
    'Nothing was captured. The note was empty or malformed — check the text and try again.',
  not_found:
    'Nothing was captured. The topic, gap, or source this note points to could not be found.',
}

const FALLBACK_MESSAGE = 'Nothing was captured. The request was rejected.'

export function noteCaptureErrorMessage(
  code: string,
  message: string | null,
): string {
  const known = NOTE_CAPTURE_ERROR_MESSAGE[code]

  if (known) {
    return known
  }

  return message && message.trim() !== '' ? message : FALLBACK_MESSAGE
}
