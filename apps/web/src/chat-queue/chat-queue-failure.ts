export type ChatQueueFailureKind =
  | 'cap_reached'
  | 'budget_paused'
  | 'in_flight'
  | 'not_in_chat'
  | 'proposal_not_pending'
  | 'wrong_shape'
  | 'not_found'
  | 'no_messages'
  | 'model_failed'
  | 'offline'
  | 'other'

export type ChatQueueOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; failure: ChatQueueFailureKind }

const MESSAGES: Record<ChatQueueFailureKind, string> = {
  cap_reached: 'You have used all the questions for this card. Accept it, reject it, or go back.',
  budget_paused: 'AI is paused for now to protect the budget. Try again later.',
  in_flight: 'The AI is still answering your last message. Wait a moment.',
  not_in_chat: 'This card is no longer waiting in Chat.',
  proposal_not_pending: 'This proposal was already decided.',
  wrong_shape: 'This card type cannot be rewritten from chat.',
  not_found: 'This card no longer exists.',
  no_messages: 'There is nothing to delete yet.',
  model_failed: 'The AI could not answer. Try again, no question was used.',
  offline: 'You are offline. Nothing was changed, try again when you are online.',
  other: 'Something went wrong. Try again.',
}

export function chatQueueFailureMessage(kind: ChatQueueFailureKind): string {
  return MESSAGES[kind]
}

export function chatQueueFailureFromApi(
  status: number,
  code: string | undefined,
): ChatQueueFailureKind {
  switch (code) {
    case 'cap_reached':
    case 'budget_paused':
    case 'in_flight':
    case 'not_in_chat':
    case 'proposal_not_pending':
    case 'wrong_shape':
    case 'no_messages':
    case 'model_failed':
      return code
    default:
      break
  }

  if (status === 404) {
    return 'not_found'
  }

  if (status === 429) {
    return 'cap_reached'
  }

  if (status === 423) {
    return 'budget_paused'
  }

  if (status === 502) {
    return 'model_failed'
  }

  return 'other'
}

export function chatQueueFailureFromThrown(): ChatQueueFailureKind {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'other'
}
