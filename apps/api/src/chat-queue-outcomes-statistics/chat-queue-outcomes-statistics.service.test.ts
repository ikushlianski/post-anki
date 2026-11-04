import { describe, expect, it } from "vitest";
import { buildChatQueueOutcomesStatistics } from "./chat-queue-outcomes-statistics.service.js";

describe("buildChatQueueOutcomesStatistics", () => {
  it("should total every Chat card of the last 30 days across its four outcomes", () => {
    expect(buildChatQueueOutcomesStatistics({ accepted: 4, rejected: 2, waiting: 3, snoozed: 1 })).toEqual({
      windowDays: 30,
      total: 10,
      accepted: 4,
      rejected: 2,
      waiting: 3,
      snoozed: 1,
    });
  });

  it("should report zero total when no card was sent to Chat", () => {
    expect(buildChatQueueOutcomesStatistics({ accepted: 0, rejected: 0, waiting: 0, snoozed: 0 }).total).toBe(0);
  });
});
