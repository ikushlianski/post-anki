import { KNOWLEDGE_ITEM_MODEL_OPTIONS, chatModelIdSchema } from '@post-anki/shared'

import { useChatModel } from './use-chat-model'

export function ChatModelPicker({ disabled }: { disabled?: boolean }) {
  const [modelId, setModelId] = useChatModel()

  return (
    <select
      data-testid="chat-model-picker"
      aria-label="Chat model"
      title="Model used for the next reply"
      disabled={disabled}
      value={modelId ?? ''}
      onChange={(event) => {
        const parsed = chatModelIdSchema.safeParse(event.target.value)

        setModelId(parsed.success ? parsed.data : undefined)
      }}
      className="max-w-[10rem] rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs text-neutral-600"
    >
      <option value="">Default model</option>
      {KNOWLEDGE_ITEM_MODEL_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
