import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

import { chatQueueCounts } from "./chat-queue-counts";

export function ChatQueueSummary({
  items,
  now = new Date(),
}: {
  items: ChatQueueKnowledgeBit[];
  now?: Date;
}) {
  if (items.length === 0) return null;

  const { waiting, snoozed } = chatQueueCounts(items, now);

  return (
    <p
      data-testid="chat-queue-summary"
      className="mt-2 text-sm font-medium text-neutral-700"
    >
      {snoozed > 0 ? `${waiting} waiting · ${snoozed} snoozed` : `${waiting} waiting`}
    </p>
  );
}
