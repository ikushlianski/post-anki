import { describe, expect, it, vi } from "vitest";
import type { WeeklyDigestCard } from "@post-anki/shared";
import { formatTrend, formatWeeklyDigestReply } from "./weekly-digest-command.js";
import { DIGEST_UNREACHABLE_REPLY, handleWeeklyDigestCommand } from "./weekly-digest-command.handler.js";

const CARD: WeeklyDigestCard = {
  current: { accepted: 8, rejected: 2, reviewed: 5 },
  previous: { accepted: 5, rejected: 4, reviewed: 5 },
  chatBacklog: 3,
  windowStart: "2026-10-22T00:00:00Z",
  windowEnd: "2026-10-29T00:00:00Z",
};

describe("formatTrend", () => {
  it("says up, down or same as last week from the two counts", () => {
    expect(formatTrend(8, 5)).toBe("up 3");
    expect(formatTrend(2, 4)).toBe("down 2");
    expect(formatTrend(5, 5)).toBe("same as last week");
  });
});

describe("formatWeeklyDigestReply", () => {
  it("shows each count with its change against the previous 7 days and the chat backlog", () => {
    expect(formatWeeklyDigestReply({ card: CARD })).toBe(
      [
        "Weekly digest (last 7 days vs previous 7)",
        "Accepted: 8 (up 3)",
        "Rejected: 2 (down 2)",
        "Reviewed: 5 (same as last week)",
        "Chat backlog: 3",
      ].join("\n"),
    );
  });

  it("adds a Chat line with cards and turns only when there were chat turns this week", () => {
    const withChat = formatWeeklyDigestReply({ card: { ...CARD, chatCards: 3, chatTurns: 7 } });

    expect(withChat.split("\n").at(-1)).toBe("Chat: 3 cards, 7 turns this week");
    expect(formatWeeklyDigestReply({ card: { ...CARD, chatCards: 0, chatTurns: 0 } })).not.toMatch(/Chat:/);
    expect(formatWeeklyDigestReply({ card: CARD })).not.toMatch(/Chat:/);
  });

  it("lists top reject reasons with a signed change versus last week and no change marker when 0 or absent", () => {
    const reply = formatWeeklyDigestReply({
      card: {
        ...CARD,
        topRejectReasons: [
          { reason: "wrong_language", count: 5, delta: 3 },
          { reason: "bad_format", count: 2, delta: -2 },
          { reason: "other", count: 1, delta: 0 },
          { reason: "unspecified", count: 1 },
        ],
      },
    });

    expect(reply).toContain(
      [
        "Top reject reasons:",
        "- Wrong language: 5 (+3)",
        "- Bad format (broken blank, yes/no): 2 (-2)",
        "- Other: 1",
        "- No reason given: 1",
      ].join("\n"),
    );
    expect(formatWeeklyDigestReply({ card: CARD })).not.toMatch(/Top reject reasons/);
  });

  it("links to the web Chat page when a base URL is set", () => {
    expect(formatWeeklyDigestReply({ card: CARD, webBaseUrl: "https://app.test/" })).toMatch(
      /\nhttps:\/\/app\.test\/knowledge\/chat$/,
    );
  });

  it("also links to the Rejected page when reject reasons are listed and a base URL is set", () => {
    const card: WeeklyDigestCard = { ...CARD, topRejectReasons: [{ reason: "other", count: 1 }] };
    const lines = formatWeeklyDigestReply({ card, webBaseUrl: "https://app.test/" }).split("\n");

    expect(lines.at(-2)).toBe("https://app.test/knowledge/chat");
    expect(lines.at(-1)).toBe("https://app.test/knowledge/rejected");
  });

  it("omits the Rejected link without reasons or without a base URL", () => {
    const card: WeeklyDigestCard = { ...CARD, topRejectReasons: [{ reason: "other", count: 1 }] };

    expect(formatWeeklyDigestReply({ card: CARD, webBaseUrl: "https://app.test" })).not.toContain("/knowledge/rejected");
    expect(formatWeeklyDigestReply({ card })).not.toContain("/knowledge/rejected");
  });
});

describe("handleWeeklyDigestCommand", () => {
  it("sends the formatted digest to the asking chat", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleWeeklyDigestCommand(7, { fetchDigest: async () => CARD, sendMessage });

    expect(sendMessage).toHaveBeenCalledWith(7, formatWeeklyDigestReply({ card: CARD }));
  });

  it("sends a friendly line when the API is unreachable", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleWeeklyDigestCommand(7, { fetchDigest: async () => Promise.reject(new Error("boom")), sendMessage });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(7, DIGEST_UNREACHABLE_REPLY);
  });
});
