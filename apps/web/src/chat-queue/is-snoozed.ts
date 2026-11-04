import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

export function isSnoozed(
  item: Pick<ChatQueueKnowledgeBit, "snoozedUntil">,
  now: Date,
): boolean {
  if (!item.snoozedUntil) return false;

  return new Date(item.snoozedUntil).getTime() > now.getTime();
}
