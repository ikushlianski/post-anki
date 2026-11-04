import { describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";
import { handleUpdate, type HandlerDeps } from "./webhook.handler.js";
import { createUpdateLru } from "./update-lru.js";
import { classifyText } from "../conversation/reply.js";
import { buildBotCommands } from "./register-commands.js";
import type { FlowDeps } from "../conversation/probe-flow.js";

const OWNER = 42;

function textUpdate(text: string, id = 1): Update {
  return {
    update_id: id,
    message: { message_id: 1, date: 0, chat: { id: OWNER, type: "private", first_name: "x" }, text },
  } as Update;
}

function photoUpdate(caption: string): Update {
  return {
    update_id: 1,
    message: { message_id: 1, date: 0, chat: { id: OWNER, type: "private", first_name: "x" }, photo: [], caption },
  } as unknown as Update;
}

function makeDeps(extra: Partial<HandlerDeps>): HandlerDeps {
  return {
    ownerChatId: OWNER,
    lru: createUpdateLru(8),
    flow: {
      getPending: vi.fn().mockResolvedValue(null),
      clearPending: vi.fn(),
      submitAnswer: vi.fn().mockResolvedValue({}),
    } as unknown as FlowDeps,
    defaultMode: "socratic",
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getChatContext: vi.fn().mockResolvedValue(null),
    ...extra,
  };
}

describe("classifyText reminder and stats commands", () => {
  it("should read the number of days after /pause", () => {
    expect(classifyText("/pause 3")).toEqual({ kind: "pause", arg: "3" });
    expect(classifyText("/pause")).toEqual({ kind: "pause", arg: null });
  });

  it("should recognise /resume and /streak", () => {
    expect(classifyText("/resume")).toEqual({ kind: "resume" });
    expect(classifyText("/streak")).toEqual({ kind: "streak" });
  });
});

describe("handleUpdate reminder and stats commands", () => {
  it("should route /pause with its days to the pause handler", async () => {
    const onPause = vi.fn().mockResolvedValue(undefined);

    await handleUpdate(textUpdate("/pause 10"), makeDeps({ onPause }));

    expect(onPause).toHaveBeenCalledWith(OWNER, "10");
  });

  it("should route /resume and /streak to their handlers", async () => {
    const onResume = vi.fn().mockResolvedValue(undefined);
    const onStreak = vi.fn().mockResolvedValue(undefined);

    await handleUpdate(textUpdate("/resume", 1), makeDeps({ onResume }));
    await handleUpdate(textUpdate("/streak", 2), makeDeps({ onStreak }));

    expect(onResume).toHaveBeenCalledWith(OWNER);
    expect(onStreak).toHaveBeenCalledWith(OWNER);
  });

  it("should list the new commands in the Telegram command menu", () => {
    const names = buildBotCommands().map((entry) => entry.command);

    expect(names).toEqual(expect.arrayContaining(["pause", "resume", "streak"]));
  });

  it("should process a photo caption as the note instead of declining", async () => {
    const submitAnswer = vi.fn().mockResolvedValue({});
    const deps = makeDeps({});
    const sendMessage = vi.mocked(deps.sendMessage);

    deps.flow = {
      ...deps.flow,
      getPending: vi.fn().mockResolvedValue({ topicId: "t", gapId: "g", mode: "socratic" }),
      submitAnswer,
    };

    await handleUpdate(photoUpdate("worth reading"), deps);

    expect(sendMessage).not.toHaveBeenCalledWith(OWNER, "I can only read text for now.");
    expect(submitAnswer).toHaveBeenCalled();
  });
});
