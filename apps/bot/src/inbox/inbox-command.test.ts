import { describe, expect, it, vi } from "vitest";
import { EMPTY_INBOX_REPLY, formatInboxReply } from "./inbox-command.js";
import { INBOX_UNREACHABLE_REPLY, handleInboxCommand } from "./inbox-command.handler.js";

describe("formatInboxReply", () => {
  it("should tell the owner the Inbox is empty when no cards wait", () => {
    expect(formatInboxReply({ count: 0, shown: 0 }, "https://app.test")).toBe(EMPTY_INBOX_REPLY);
  });

  it("should show the count with a link to the web Inbox", () => {
    expect(formatInboxReply({ count: 3, shown: 3 }, "https://app.test/")).toBe(
      "📥 3 cards in your Inbox — https://app.test/knowledge/inbox",
    );
  });

  it("should use the singular for one card", () => {
    expect(formatInboxReply({ count: 1, shown: 1 }, "https://app.test")).toContain("1 card in your Inbox");
  });

  it("should still show the count when no web address is configured", () => {
    expect(formatInboxReply({ count: 2, shown: 2 })).toBe("📥 2 cards in your Inbox");
  });
});

describe("formatInboxReply truncation", () => {
  it("should say the count is a lower bound and show the real total when truncated", () => {
    const reply = formatInboxReply({ count: 200, shown: 200, total: 350, hasMore: true });

    expect(reply).toContain("200+ cards in your Inbox");
    expect(reply).toContain("Showing the first 200 of 350");
  });

  it("should omit the total when the API did not send one", () => {
    const reply = formatInboxReply({ count: 200, shown: 200, hasMore: true });

    expect(reply).toContain("Showing the first 200");
    expect(reply).not.toContain(" of ");
  });

  it("should not change the reply when hasMore is false", () => {
    expect(formatInboxReply({ count: 4, shown: 4, total: 4, hasMore: false })).toBe("📥 4 cards in your Inbox");
  });
});

describe("handleInboxCommand", () => {
  it("should reply with the live Inbox count", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleInboxCommand(42, {
      fetchInbox: vi.fn().mockResolvedValue({ count: 5, shown: 5 }),
      sendMessage,
      webBaseUrl: "https://app.test",
    });

    expect(sendMessage).toHaveBeenCalledWith(42, "📥 5 cards in your Inbox — https://app.test/knowledge/inbox");
  });

  it("should send a friendly line when the API is unreachable", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleInboxCommand(42, {
      fetchInbox: vi.fn().mockRejectedValue(new Error("down")),
      sendMessage,
    });

    expect(sendMessage).toHaveBeenCalledWith(42, INBOX_UNREACHABLE_REPLY);
  });
});
