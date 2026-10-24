import type { ReactNode, RefObject } from 'react'

export interface ChatListMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  footer?: ReactNode
}

export function ChatMessageList({
  messages,
  pending,
  emptyText,
  testIdPrefix,
  scrollRef,
}: {
  messages: ChatListMessage[]
  pending: boolean
  emptyText: string
  testIdPrefix: string
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={scrollRef}
      className="max-h-96 min-h-[8rem] space-y-2 overflow-y-auto p-3"
      data-testid={`${testIdPrefix}-messages`}
    >
      {messages.length === 0 ? <p className="text-sm text-neutral-400">{emptyText}</p> : null}

      {messages.map((message) => (
        <div
          key={message.id}
          className={message.role === 'assistant' ? 'mr-auto max-w-[90%]' : 'ml-auto max-w-[90%]'}
        >
          <div
            data-testid={`${testIdPrefix}-message-${message.role}`}
            className={
              message.role === 'assistant'
                ? 'rounded-lg rounded-bl-none bg-neutral-50 px-3 py-2 text-sm text-neutral-800'
                : 'rounded-lg rounded-br-none bg-neutral-900 px-3 py-2 text-sm text-white'
            }
          >
            {message.text}
          </div>
          {message.footer}
        </div>
      ))}

      {pending ? (
        <div
          data-testid={`${testIdPrefix}-typing-indicator`}
          className="mr-auto flex max-w-[60%] items-center gap-1 rounded-lg rounded-bl-none bg-neutral-50 px-3 py-2 text-sm text-neutral-400"
        >
          <span className="animate-pulse">Thinking…</span>
        </div>
      ) : null}
    </div>
  )
}

export function ChatInputRow({
  draft,
  onDraftChange,
  onSend,
  pending,
  disabled = false,
  testIdPrefix,
}: {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  pending: boolean
  disabled?: boolean
  testIdPrefix: string
}) {
  return (
    <div className="flex gap-2 border-t border-neutral-200 p-3">
      <input
        type="text"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSend()
          }
        }}
        disabled={pending || disabled}
        placeholder="Ask a question…"
        data-testid={`${testIdPrefix}-input`}
        className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100"
      />
      <button
        type="button"
        data-testid={`${testIdPrefix}-send`}
        disabled={pending || disabled || draft.trim().length === 0}
        onClick={onSend}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Send
      </button>
    </div>
  )
}
