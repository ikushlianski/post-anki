import { describe, it, expect, vi } from "vitest";
import { handleUpdate, type HandlerDeps } from "./webhook.handler.js";
import { createUpdateLru } from "./update-lru.js";
import { START_REPLY, DECLINE_REPLY, ERROR_REPLY } from "../conversation/reply.js";
import type { FlowDeps } from "../conversation/probe-flow.js";
import type { Update } from "grammy/types";

const OWNER = 42;
const STRANGER = 999;

function update(opts: { id?: number; chatId?: number; text?: string; voice?: boolean }): Update {
  const chat = { id: opts.chatId ?? OWNER, type: "private" as const, first_name: "x" };
  const base = { message_id: 1, date: 0, chat };

  return {
    update_id: opts.id ?? 1,
    message: opts.voice
      ? ({ ...base, voice: { file_id: "v", file_unique_id: "v", duration: 1 } } as Update["message"])
      : ({ ...base, text: opts.text ?? "hello" } as Update["message"]),
  };
}

function makeFlow(): FlowDeps {
  return {
    getDailyPush: vi.fn().mockResolvedValue({
      push: {
        topicId: "t1",
        topicTitle: "Idempotency",
        curriculumId: "c1",
        curriculumName: "Backend",
        gap: { id: "g1", topicId: "t1", label: "keys", depth: "working", origin: "ai", state: "open", wanted: false, concern: null, lastEvaluatedAt: null },
        reason: "weakest",
      },
      question: { gapId: "g1", gapLabel: "keys", kind: "socratic", prompt: "Why idempotency keys?" },
    }),
    submitAnswer: vi.fn().mockResolvedValue({
      outcome: "pass",
      coveredGapLabels: ["keys"],
      feedback: "Solid.",
      progress: { status: "in_progress", maturity: 50, attempts: 1, lastInteractedAt: null },
      learningStatus: "probing",
      nextQuestion: null,
    }),
    getPending: vi.fn().mockResolvedValue({ topicId: "t1", gapId: "g1", mode: "socratic" }),
    setPending: vi.fn().mockResolvedValue(undefined),
    clearPending: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(flow: FlowDeps): HandlerDeps & { sendMessage: ReturnType<typeof vi.fn> } {
  return {
    ownerChatId: OWNER,
    lru: createUpdateLru(8),
    flow,
    defaultMode: "socratic",
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleUpdate", () => {
  it("drops a stranger silently", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ chatId: STRANGER }), deps);
    expect(flow.getDailyPush).not.toHaveBeenCalled();
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("processes an update once even if Telegram retries", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ id: 7, text: "first" }), deps);
    await handleUpdate(update({ id: 7, text: "first" }), deps);
    expect(flow.submitAnswer).toHaveBeenCalledTimes(1);
  });

  it("answers /start without touching the API", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "/start" }), deps);
    expect(flow.getDailyPush).not.toHaveBeenCalled();
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, START_REPLY);
  });

  it("declines a voice message", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ voice: true }), deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, DECLINE_REPLY);
  });

  it("/today fetches and sends the daily question", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "/today" }), deps);
    expect(flow.getDailyPush).toHaveBeenCalledWith("socratic");
    expect(deps.sendMessage).toHaveBeenCalledOnce();
    expect((deps.sendMessage.mock.calls[0]![1] as string)).toContain("Why idempotency keys?");
  });

  it("free text is submitted as an answer to the pending question", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "keys dedupe retried writes" }), deps);
    expect(flow.submitAnswer).toHaveBeenCalledWith({
      topicId: "t1",
      gapId: "g1",
      mode: "socratic",
      answer: "keys dedupe retried writes",
    });
    expect((deps.sendMessage.mock.calls[0]![1] as string)).toContain("Solid.");
  });

  it("falls back to the fixed apology when the flow throws", async () => {
    const flow = makeFlow();
    flow.submitAnswer = vi.fn().mockRejectedValue(new Error("api down"));
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "answer" }), deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, ERROR_REPLY);
  });
});
