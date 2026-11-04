import { describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";
import { handleUpdate, type HandlerDeps } from "./webhook.handler.js";
import { createUpdateLru } from "./update-lru.js";
import type { FlowDeps } from "../conversation/probe-flow.js";

const OWNER = 42;
const STRANGER = 999;

function rejectedUpdate(chatId: number): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: chatId, type: "private", first_name: "x" },
      text: "/rejected",
    },
  } as Update;
}

describe("handleUpdate /rejected guard", () => {
  it("should give a non-owner chat no rejected-cards data and no reply", async () => {
    const onRejected = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const deps = {
      ownerChatId: OWNER,
      lru: createUpdateLru(8),
      flow: {} as FlowDeps,
      defaultMode: "socratic",
      sendMessage,
      onStart: vi.fn(),
      getChatContext: vi.fn().mockResolvedValue(null),
      onRejected,
    } as HandlerDeps;

    await handleUpdate(rejectedUpdate(STRANGER), deps);

    expect(onRejected).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
