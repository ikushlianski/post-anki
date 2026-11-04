import { describe, expect, it, vi } from "vitest";
import type { ChatQueueKnowledgeBit } from "@post-anki/shared";
import { EMPTY_CHAT_REPLY, formatChatCommandReply } from "./chat-command.js";
import { CHAT_UNREACHABLE_REPLY, handleChatCommand } from "./chat-command.handler.js";

const NOW = new Date("2026-10-29T12:00:00Z");

function card(id: string, daysAgo: number, over: Partial<ChatQueueKnowledgeBit> = {}): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Body ${id}`,
    background: null,
    origin: "extracted",
    subjectName: null,
    chatAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    turnsLeft: 8,
    snoozedUntil: null,
    ...over,
  };
}

describe("formatChatCommandReply", () => {
  it("tells the owner nothing is waiting when the queue is empty", () => {
    expect(formatChatCommandReply({ items: [], now: NOW })).toBe(EMPTY_CHAT_REPLY);
  });

  it("tells the owner how many cards are snoozed when every card is snoozed", () => {
    const future = new Date(NOW.getTime() + 86_400_000).toISOString();
    const items = [card("a", 5, { snoozedUntil: future }), card("b", 4, { snoozedUntil: future })];

    expect(formatChatCommandReply({ items, now: NOW })).toBe("No Chat cards waiting — 2 snoozed.");
  });

  it("never cuts an emoji in half when shortening a preview or subject", () => {
    const body = `${"a".repeat(59)}😀 tail`;
    const subject = `${"b".repeat(23)}😀 tail`;
    const reply = formatChatCommandReply({ items: [card("a", 5, { body, subjectName: subject })], now: NOW });

    expect(reply).toContain(`${"b".repeat(23)}…`);
    expect(reply).toContain(`${"a".repeat(59)}…`);
    expect(reply).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("lists only the ten oldest cards on the first page, oldest first", () => {
    const items = [1, 9, 3, 7, 5, 8, 2, 11, 12, 4, 6, 10, 13].map((d) => card(`c${d}`, d));
    const lines = formatChatCommandReply({ items, now: NOW }).split("\n").slice(1, -1);

    expect(lines).toHaveLength(10);
    expect(lines.map((l) => l.split(" ")[1])).toEqual([
      "13d",
      "12d",
      "11d",
      "10d",
      "9d",
      "8d",
      "7d",
      "6d",
      "5d",
      "4d",
    ]);
  });

  it("stays within the Telegram message limit at the card cap with links", () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      card("0198f2a4-aaaa-bbbb-cccc-" + String(i).padStart(12, "0"), i + 1, { body: "y".repeat(500) }),
    );
    const reply = formatChatCommandReply({ items, now: NOW, webBaseUrl: "https://postanki.ilya.online" });

    expect(reply.length).toBeLessThan(4096);
  });

  it("shows hours for a card that waited under a day", () => {
    const chatAt = new Date(NOW.getTime() - 5 * 3_600_000).toISOString();
    const reply = formatChatCommandReply({ items: [card("a", 0, { chatAt })], now: NOW });

    expect(reply).toContain("• 5h · Body a");
  });

  it("shows the age in days and a 60-character preview of the body", () => {
    const body = "x".repeat(100);
    const reply = formatChatCommandReply({ items: [card("a", 1, { body })], now: NOW });

    expect(reply).toContain(`• 1d · ${"x".repeat(60)}…`);
    expect(reply).not.toContain("x".repeat(61));
  });

  it("shows the trimmed subject name between the age and the preview", () => {
    const reply = formatChatCommandReply({ items: [card("a", 2, { subjectName: "  Rust  " })], now: NOW });

    expect(reply).toContain("• 2d · Rust · Body a");
  });

  it("leaves the line unchanged when the card has no subject", () => {
    const reply = formatChatCommandReply({ items: [card("a", 2, { subjectName: "   " })], now: NOW });

    expect(reply).toContain("• 2d · Body a");
  });

  it("cuts a long subject name to 24 characters with an ellipsis", () => {
    const reply = formatChatCommandReply({
      items: [card("a", 2, { subjectName: "s".repeat(40) })],
      now: NOW,
    });

    expect(reply).toContain(`• 2d · ${"s".repeat(24)}… · Body a`);
    expect(reply).not.toContain("s".repeat(25));
  });

  it("collapses line breaks so a card stays on one line", () => {
    const reply = formatChatCommandReply({ items: [card("a", 2, { body: "a\n\nb" })], now: NOW });

    expect(reply).toContain("a b");
  });

  it("links each card to its own Chat thread right under its line", () => {
    const items = [card("a", 3), card("b id", 2)];
    const lines = formatChatCommandReply({ items, now: NOW, webBaseUrl: "https://x.test/" }).split("\n");

    expect(lines.slice(1)).toEqual([
      "• 3d · Body a",
      "https://x.test/knowledge/chat?card=a",
      "• 2d · Body b id",
      "https://x.test/knowledge/chat?card=b%20id",
    ]);
  });

  it("adds no links when no base URL is configured", () => {
    const without = formatChatCommandReply({ items: [card("a", 2)], now: NOW });

    expect(without).not.toContain("http");
  });

  it("states the singular header when exactly one card waits", () => {
    const header = formatChatCommandReply({ items: [card("a", 2)], now: NOW }).split("\n")[0];

    expect(header).toBe("💬 1 Chat card waiting, oldest first:");
  });

  it("states the plural total in the header and ignores snoozed cards", () => {
    const items = [
      card("a", 1),
      card("b", 2),
      card("c", 3),
      card("d", 4, { snoozedUntil: "2026-11-30T00:00:00Z" }),
    ];

    expect(formatChatCommandReply({ items, now: NOW }).split("\n")[0]).toBe(
      "💬 3 Chat cards waiting, 1 snoozed, oldest first:",
    );
  });
});

describe("formatChatCommandReply paging", () => {
  const items = Array.from({ length: 25 }, (_, i) => card(`c${i + 1}`, i + 1));
  const pageOf = (pageArg: string | null) => formatChatCommandReply({ items, now: NOW, pageArg });

  it("shows cards 11 to 20 with the footer when the owner asks for page 2", () => {
    const lines = pageOf("2").split("\n");

    expect(lines[1]).toBe("• 15d · Body c15");
    expect(lines).toHaveLength(12);
    expect(lines.at(-1)).toBe("Page 2 of 3 — send /chat 3 for the next page.");
  });

  it("keeps the total of all waiting cards in the header on every page", () => {
    for (const arg of [null, "2", "3"]) {
      expect(pageOf(arg).split("\n")[0]).toBe("💬 25 Chat cards waiting, oldest first:");
    }
  });

  it("points to page 2 from the first page when more cards exist", () => {
    expect(pageOf(null).split("\n").at(-1)).toBe("Page 1 of 3 — send /chat 2 for the next page.");
  });

  it("shows no next-page command on the last page", () => {
    const lines = pageOf("3").split("\n");

    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toBe("Page 3 of 3");
  });

  it("adds no footer when everything fits on one page", () => {
    const reply = formatChatCommandReply({ items: items.slice(0, 4), now: NOW });

    expect(reply).not.toContain("Page");
  });

  it.each(["0", "-1", "abc", "1.5", "2 3"])("explains instead of crashing for page %s", (arg) => {
    expect(pageOf(arg)).toBe("Page must be a whole number from 1 to 3, e.g. /chat 2.");
  });

  it("explains that a page past the end does not exist", () => {
    expect(pageOf("9")).toBe("Page 9 doesn't exist — there are only 3 pages.");
  });

  it("still says nothing is waiting for an empty queue whatever the page", () => {
    expect(formatChatCommandReply({ items: [], now: NOW, pageArg: "4" })).toBe(EMPTY_CHAT_REPLY);
  });
});

describe("formatChatCommandReply snoozed count", () => {
  const future = new Date(NOW.getTime() + 86_400_000).toISOString();

  it("states how many cards are snoozed next to the waiting count", () => {
    const items = [
      card("a", 5),
      card("b", 4),
      card("c", 3),
      card("d", 2, { snoozedUntil: future }),
      card("e", 2, { snoozedUntil: future }),
    ];

    expect(formatChatCommandReply({ items, now: NOW }).split("\n")[0]).toBe(
      "💬 3 Chat cards waiting, 2 snoozed, oldest first:",
    );
  });

  it("keeps the singular wording for one waiting card with snoozed ones", () => {
    const items = [card("a", 5), card("b", 2, { snoozedUntil: future })];

    expect(formatChatCommandReply({ items, now: NOW }).split("\n")[0]).toBe(
      "💬 1 Chat card waiting, 1 snoozed, oldest first:",
    );
  });

  it("omits the snoozed part when nothing is snoozed or the snooze already ended", () => {
    const ended = new Date(NOW.getTime() - 1000).toISOString();
    const items = [card("a", 5, { snoozedUntil: ended }), card("b", 4)];

    expect(formatChatCommandReply({ items, now: NOW }).split("\n")[0]).toBe(
      "💬 2 Chat cards waiting, oldest first:",
    );
  });
});

describe("formatChatCommandReply truncation", () => {
  const items = [card("a", 5), card("b", 2)];

  it("should show a lower-bound count and the real total when the list was cut", () => {
    const reply = formatChatCommandReply({ items, now: NOW, hasMore: true, total: 450 });

    expect(reply).toContain("💬 2+ Chat cards waiting");
    expect(reply.split("\n").at(-1)).toBe("Showing the first 2 of 450");
  });

  it("should base the lower bound on waiting cards, not snoozed ones", () => {
    const future = new Date(NOW.getTime() + 86_400_000).toISOString();
    const mixed = [card("a", 5), card("b", 4), card("c", 3, { snoozedUntil: future })];
    const reply = formatChatCommandReply({ items: mixed, now: NOW, hasMore: true, total: 400 });

    expect(reply).toContain("💬 2+ Chat cards waiting, 1 snoozed");
    expect(reply.split("\n").at(-1)).toBe("Showing the first 3 of 400");
  });

  it("should omit the total when the API did not send one", () => {
    const reply = formatChatCommandReply({ items, now: NOW, hasMore: true });

    expect(reply.split("\n").at(-1)).toBe("Showing the first 2");
  });

  it("should not change the reply when the list is complete", () => {
    expect(formatChatCommandReply({ items, now: NOW, hasMore: false, total: 2 })).toBe(
      formatChatCommandReply({ items, now: NOW }),
    );
  });
});

describe("handleChatCommand", () => {
  it("replies with a friendly line when the API is unreachable", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const fetchQueue = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(handleChatCommand(7, { fetchQueue, sendMessage, now: () => NOW })).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(7, CHAT_UNREACHABLE_REPLY);
  });

  it("passes the page the owner typed to the listing", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const many = Array.from({ length: 12 }, (_, i) => card(`c${i + 1}`, i + 1));
    const fetchQueue = vi.fn().mockResolvedValue({ items: many, count: 12 });

    await handleChatCommand(7, { fetchQueue, sendMessage, now: () => NOW }, "2");

    expect(sendMessage).toHaveBeenCalledWith(7, expect.stringContaining("Page 2 of 2"));
  });

  it("sends the formatted reply built from the fetched queue", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const fetchQueue = vi.fn().mockResolvedValue({ items: [card("a", 4)], count: 1 });

    await handleChatCommand(7, { fetchQueue, sendMessage, now: () => NOW });

    expect(sendMessage).toHaveBeenCalledWith(7, expect.stringContaining("• 4d · Body a"));
  });

  it("sends the empty message when the queue has no cards", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const fetchQueue = vi.fn().mockResolvedValue({ items: [], count: 0 });

    await handleChatCommand(7, { fetchQueue, sendMessage, now: () => NOW });

    expect(sendMessage).toHaveBeenCalledWith(7, EMPTY_CHAT_REPLY);
  });
});
