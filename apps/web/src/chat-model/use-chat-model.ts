import { useCallback, useSyncExternalStore } from 'react'
import { chatModelIdSchema, type KnowledgeItemModelId } from '@post-anki/shared'

export const CHAT_MODEL_STORAGE_KEY = 'post-anki.chat-model-id'

const listeners = new Set<() => void>()

function readStored(): KnowledgeItemModelId | undefined {
  try {
    const parsed = chatModelIdSchema.safeParse(window.localStorage.getItem(CHAT_MODEL_STORAGE_KEY))

    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function writeStored(modelId: KnowledgeItemModelId | undefined): void {
  try {
    if (modelId) {
      window.localStorage.setItem(CHAT_MODEL_STORAGE_KEY, modelId)
    } else {
      window.localStorage.removeItem(CHAT_MODEL_STORAGE_KEY)
    }
  } catch {
    return
  }

  listeners.forEach((listener) => listener())
}

export function useChatModel(): [
  KnowledgeItemModelId | undefined,
  (modelId: KnowledgeItemModelId | undefined) => void,
] {
  const modelId = useSyncExternalStore(subscribe, readStored, () => undefined)
  const setModelId = useCallback((next: KnowledgeItemModelId | undefined) => writeStored(next), [])

  return [modelId, setModelId]
}
