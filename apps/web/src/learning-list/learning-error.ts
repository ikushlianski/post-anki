const LEARNING_ERROR_MESSAGE: Record<string, string> = {
  not_found: 'That item no longer exists. Refresh the list and try again.',
  not_capturable:
    'This item was already handled or is being processed. Refresh the list to see where it stands.',
  not_parked:
    'This item is no longer waiting for a decision. Refresh the list to see its current state.',
  not_awaiting_decision:
    'This recommendation was already answered. Refresh the list to see the result.',
  fold_in_area_missing:
    'There is no matching Area to fold this into yet. Pick another destination.',
  invalid_input: 'That request was not accepted. Check your choice and try again.',
  role_template_not_found:
    'That role template is no longer available. Refresh the page and pick another.',
  subject_not_found:
    'The subject for this path could not be found. Refresh the page and try again.',
  unresolved_target:
    'This role template points at a topic that is not in your taxonomy yet, so the path could not start.',
  request_failed: 'The request could not be completed. Try again in a moment.',
}

const FALLBACK_MESSAGE = 'Something went wrong. Try again in a moment.'

export function learningErrorMessage(code: string): string {
  return LEARNING_ERROR_MESSAGE[code] ?? FALLBACK_MESSAGE
}
