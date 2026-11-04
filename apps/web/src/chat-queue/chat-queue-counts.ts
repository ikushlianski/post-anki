import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

import { isSnoozed } from "./is-snoozed";

export function chatQueueCounts(
  items: ChatQueueKnowledgeBit[],
  now: Date = new Date(),
): {
  waiting: number;
  snoozed: number;
} {
  const snoozed = items.filter((item) => isSnoozed(item, now)).length;

  return { waiting: items.length - snoozed, snoozed };
}
