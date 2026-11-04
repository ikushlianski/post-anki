import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

import { ChatQueueSnooze } from "./chat-queue-snooze";
import { chatWaitingDays, formatChatWaiting } from "./chat-queue-waiting";

interface ChatQueueRowListProps {
  items: ChatQueueKnowledgeBit[];
  focusedId: string | null;
  picked: ReadonlySet<string>;
  moving: boolean;
  now?: Date;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onSnoozeChanged: (id: string, snoozedUntil: string | null) => void;
}

export function ChatQueueRowList({
  items,
  focusedId,
  picked,
  moving,
  now,
  onToggle,
  onOpen,
  onSnoozeChanged,
}: ChatQueueRowListProps) {
  return (
    <ul className="space-y-3" data-testid="chat-queue-list">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          {item.reviewChat ? null : (
            <input
              type="checkbox"
              data-testid={`chat-queue-select-${item.id}`}
              aria-label={`Select ${item.body.slice(0, 40)}`}
              className="mt-5"
              checked={picked.has(item.id)}
              disabled={moving}
              onChange={() => onToggle(item.id)}
            />
          )}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              data-testid={`chat-queue-row-${item.id}`}
              aria-current={item.id === focusedId ? "true" : undefined}
              onClick={() => onOpen(item.id)}
              className={`w-full rounded-lg border p-4 text-left hover:bg-neutral-50 ${
                item.id === focusedId
                  ? "border-neutral-900 bg-neutral-50 ring-2 ring-neutral-900"
                  : "border-neutral-200"
              }`}
            >
              <span className="line-clamp-3 text-sm font-medium">
                {item.body}
              </span>
              <span className="mt-1 flex gap-3 text-xs text-neutral-500">
                {item.reviewChat ? (
                  <span data-testid={`chat-queue-review-badge-${item.id}`}>
                    From review
                  </span>
                ) : null}
                {item.subjectName ? <span>{item.subjectName}</span> : null}
                <span data-testid={`chat-queue-waiting-${item.id}`}>
                  {formatChatWaiting(
                    chatWaitingDays(item.chatAt, now ?? new Date()),
                  )}
                </span>
                <span>
                  {item.turnsLeft <= 0
                    ? "Limit reached"
                    : `${item.turnsLeft} left`}
                </span>
              </span>
            </button>
            {item.reviewChat ? null : (
              <ChatQueueSnooze item={item} onChanged={onSnoozeChanged} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
