import { describe, expect, it, vi } from "vitest";
import { cardsDueCount, formatStreakReply, type StreakSummary } from "./streak-command.js";
import { STREAK_UNREACHABLE_REPLY, handleStreakCommand } from "./streak-command.handler.js";

const SUMMARY: StreakSummary = {
  counts: { new: 5, learning: 2, review: 10 },
  stats: { streak: { current: 4, longest: 9 }, accuracy: { overall: 0.8, last7: 0.857 } },
};

describe("formatStreakReply", () => {
  it("should show cards due, streak and 7-day accuracy with a review link", () => {
    expect(formatStreakReply(SUMMARY, "https://app.test/")).toBe(
      [
        "🗂 12 cards due",
        "🔥 Streak: 4 days (longest 9 days)",
        "🎯 86% correct over the last 7 days",
        "https://app.test/knowledge/review",
      ].join("\n"),
    );
  });

  it("should not count brand-new cards as due", () => {
    expect(cardsDueCount(SUMMARY.counts)).toBe(12);
  });

  it("should say so when there were no reviews in the last 7 days and omit the link when nothing is due", () => {
    const reply = formatStreakReply(
      {
        counts: { new: 0, learning: 0, review: 0 },
        stats: { streak: { current: 1, longest: 1 }, accuracy: { overall: null, last7: null } },
      },
      "https://app.test",
    );

    expect(reply).toBe(
      "🗂 0 cards due\n🔥 Streak: 1 day (longest 1 day)\n🎯 No reviews in the last 7 days yet",
    );
  });
});

describe("handleStreakCommand", () => {
  it("should send the summary to the asking chat", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleStreakCommand(7, { fetchSummary: async () => SUMMARY, sendMessage });

    expect(sendMessage).toHaveBeenCalledWith(7, formatStreakReply(SUMMARY));
  });

  it("should send a friendly line when the API is unreachable", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleStreakCommand(7, { fetchSummary: vi.fn().mockRejectedValue(new Error("down")), sendMessage });

    expect(sendMessage).toHaveBeenCalledWith(7, STREAK_UNREACHABLE_REPLY);
  });
});
