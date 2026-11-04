import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

import { chatWaitingDays } from "./chat-queue-waiting";
import { isSnoozed } from "./is-snoozed";

export function oldestWaitingDays(
  items: ChatQueueKnowledgeBit[],
  now: Date,
): number {
  return items
    .filter((item) => !isSnoozed(item, now))
    .reduce((max, item) => Math.max(max, chatWaitingDays(item.chatAt, now)), 0);
}

export function ChatQueueOldestWait({
  items,
  now,
}: {
  items: ChatQueueKnowledgeBit[];
  now: Date;
}) {
  const days = oldestWaitingDays(items, now);

  if (days < 1) return null;

  return (
    <p
      data-testid="chat-queue-oldest-wait"
      className="mt-2 text-sm font-medium text-neutral-700"
    >
      {days === 1
        ? "Oldest card has waited 1 day"
        : `Oldest card has waited ${days} days`}
    </p>
  );
}
