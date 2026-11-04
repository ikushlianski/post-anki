import { EXAMPLE_AI_MAX_GENERATIONS, type KnowledgeBitExampleError } from '@post-anki/shared'

const MESSAGES: Record<KnowledgeBitExampleError, string> = {
  not_found: "Couldn't find this item. Reload and try again.",
  blocked: "Can't add an example to this item anymore.",
  example_exists: 'This item already has an example you wrote.',
  limit_reached: `${EXAMPLE_AI_MAX_GENERATIONS} AI examples used for this item`,
  generation_failed: "Couldn't write an example. Try again.",
  budget_exceeded: 'AI is paused for today.',
}

export function exampleErrorMessage(error: KnowledgeBitExampleError): string {
  return MESSAGES[error]
}
