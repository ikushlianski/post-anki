import { describe, it, expect, vi } from "vitest";
import { handleUpdate, type HandlerDeps } from "./webhook.handler.js";
import { createUpdateLru } from "./update-lru.js";
import { DECLINE_REPLY, ERROR_REPLY } from "../conversation/reply.js";
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

function makeDeps(
  flow: FlowDeps,
): HandlerDeps & {
  sendMessage: ReturnType<typeof vi.fn>;
  onStart: ReturnType<typeof vi.fn>;
} {
  return {
    ownerChatId: OWNER,
    lru: createUpdateLru(8),
    flow,
    defaultMode: "socratic",
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onStart: vi.fn().mockResolvedValue(undefined),
    getChatContext: vi.fn().mockResolvedValue(null),
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

  it("opens the subject menu on /start without touching the API", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "/start" }), deps);
    expect(flow.getDailyPush).not.toHaveBeenCalled();
    expect(deps.onStart).toHaveBeenCalledWith(OWNER);
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

  it("routes free text to the daily probe when no session is active", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    deps.getChatContext = vi
      .fn()
      .mockResolvedValue({ mode: "idle", sessionId: null, currentItemId: null, scopeKind: null, scopeId: null, navCurriculumId: null, label: null, messageId: null });
    await handleUpdate(update({ text: "an answer" }), deps);
    expect(flow.submitAnswer).toHaveBeenCalled();
  });

  it("routes free text to the socratic handler when a socratic session is active", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onSocraticText = vi.fn().mockResolvedValue(undefined);
    deps.onSocraticText = onSocraticText;
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });
    await handleUpdate(update({ text: "my explanation" }), deps);
    expect(onSocraticText).toHaveBeenCalledOnce();
    expect(flow.submitAnswer).not.toHaveBeenCalled();
  });

  it("nudges to tap a button when a quiz is active and text arrives", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "quiz",
      sessionId: "ps1",
      currentItemId: "q1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });
    await handleUpdate(update({ text: "B" }), deps);
    expect(flow.submitAnswer).not.toHaveBeenCalled();
    expect((deps.sendMessage.mock.calls[0]![1] as string)).toContain("answer buttons");
  });

  it("clears a stale interactive mode before issuing the daily question", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const clearChatContext = vi.fn().mockResolvedValue(undefined);
    deps.clearChatContext = clearChatContext;
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "socratic",
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });
    await handleUpdate(update({ text: "/today" }), deps);
    expect(clearChatContext).toHaveBeenCalledWith(OWNER);
    expect(flow.getDailyPush).toHaveBeenCalledOnce();
  });

  it("dispatches callback queries to onCallback", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onCallback = vi.fn().mockResolvedValue(undefined);
    deps.onCallback = onCallback;
    const cbUpdate: Update = {
      update_id: 50,
      callback_query: {
        id: "cb1",
        from: { id: OWNER, is_bot: false, first_name: "x" },
        chat_instance: "ci",
        data: "home",
        message: {
          message_id: 9,
          date: 0,
          chat: { id: OWNER, type: "private", first_name: "x" },
        },
      } as Update["callback_query"],
    };
    await handleUpdate(cbUpdate, deps);
    expect(onCallback).toHaveBeenCalledOnce();
  });

  it("falls back to the fixed apology when the flow throws", async () => {
    const flow = makeFlow();
    flow.submitAnswer = vi.fn().mockRejectedValue(new Error("api down"));
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "answer" }), deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, ERROR_REPLY);
  });
});
