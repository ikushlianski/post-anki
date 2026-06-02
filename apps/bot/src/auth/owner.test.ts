import { describe, it, expect } from "vitest";
import { isAuthorizedChat } from "./owner.js";
import type { Update } from "grammy/types";

const ownerId = 42;

function textUpdate(chatId: number): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: chatId, type: "private", first_name: "x" },
      from: { id: chatId, is_bot: false, first_name: "x" },
      text: "hi",
    },
  };
}

describe("isAuthorizedChat", () => {
  it("authorises the owner's chat id", () => {
    expect(isAuthorizedChat(textUpdate(ownerId), ownerId)).toBe(true);
  });

  it("rejects a non-owner chat id silently", () => {
    expect(isAuthorizedChat(textUpdate(999), ownerId)).toBe(false);
  });

  it("rejects an update with no message at all", () => {
    expect(isAuthorizedChat({ update_id: 1 } as Update, ownerId)).toBe(false);
  });

  it("rejects an update with no chat field", () => {
    const malformed = { update_id: 1, message: { message_id: 1, date: 0, text: "x" } } as Update;
    expect(isAuthorizedChat(malformed, ownerId)).toBe(false);
  });
});
