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

  it("/study <name> hands off to onStudy with the parsed name", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onStudy = onStudy;
    await handleUpdate(update({ text: "/study Temporal" }), deps);
    expect(onStudy).toHaveBeenCalledWith(OWNER, "Temporal");
    expect(flow.getDailyPush).not.toHaveBeenCalled();
    expect(flow.submitAnswer).not.toHaveBeenCalled();
  });

  it("bare /study hands off to onStudy with a null name", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onStudy = onStudy;
    await handleUpdate(update({ text: "/study" }), deps);
    expect(onStudy).toHaveBeenCalledWith(OWNER, null);
  });

  it("'let's continue' with no tool named shows the subjects screen", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "let's continue" }), deps);
    expect(deps.onStart).toHaveBeenCalledWith(OWNER);
    expect(flow.getDailyPush).not.toHaveBeenCalled();
    expect(flow.submitAnswer).not.toHaveBeenCalled();
  });

  it("'where were we' with no tool named shows the subjects screen", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "where were we" }), deps);
    expect(deps.onStart).toHaveBeenCalledWith(OWNER);
  });

  it("'let's continue with X' starts a fresh session on that tool, same as /study", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onStudy = onStudy;
    await handleUpdate(update({ text: "let's continue with Kubernetes" }), deps);
    expect(onStudy).toHaveBeenCalledWith(OWNER, "Kubernetes");
    expect(deps.onStart).not.toHaveBeenCalled();
  });

  it("'let's talk about X' starts a fresh session on that tool via the existing study path", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onStudy = onStudy;
    await handleUpdate(update({ text: "let's talk about Lambda" }), deps);
    expect(onStudy).toHaveBeenCalledWith(OWNER, "Lambda");
  });

  it("continuation language mid-socratic-session shows the subjects screen instead of being submitted as an answer (matches /study's existing mid-session behaviour)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
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
    await handleUpdate(update({ text: "let's continue" }), deps);
    expect(deps.onStart).toHaveBeenCalledWith(OWNER);
    expect(flow.submitAnswer).not.toHaveBeenCalled();
  });

  it("routes continue-with-tool through no new copy — falls back to the existing decline reply when unwired", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "let's continue with Kubernetes" }), deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, DECLINE_REPLY);
  });

  it("routes bare continue through no new copy — falls back to the existing decline reply when unwired", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow) as HandlerDeps & { sendMessage: ReturnType<typeof vi.fn> };
    deps.onStart = undefined;
    await handleUpdate(update({ text: "let's continue" }), deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, DECLINE_REPLY);
  });

  it("/study runs even mid-socratic session, without touching the socratic handler", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    const onSocraticText = vi.fn().mockResolvedValue(undefined);
    deps.onStudy = onStudy;
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
    await handleUpdate(update({ text: "/study Temporal" }), deps);
    expect(onStudy).toHaveBeenCalledWith(OWNER, "Temporal");
    expect(onSocraticText).not.toHaveBeenCalled();
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

  it("/done dispatches to onDone only when a socratic session is active (AC 1, 2)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onDone = vi.fn().mockResolvedValue(undefined);
    deps.onDone = onDone;
    const socraticContext = {
      mode: "socratic" as const,
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    };
    deps.getChatContext = vi.fn().mockResolvedValue(socraticContext);

    await handleUpdate(update({ text: "/done" }), deps);

    expect(onDone).toHaveBeenCalledWith(OWNER, socraticContext);
    expect(flow.submitAnswer).not.toHaveBeenCalled();
  });

  it("/done outside an active socratic session falls through to the existing pending-answer path unchanged (AC 3)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onDone = vi.fn().mockResolvedValue(undefined);
    deps.onDone = onDone;
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: null,
      label: null,
      messageId: null,
    });

    await handleUpdate(update({ text: "/done" }), deps);

    expect(onDone).not.toHaveBeenCalled();
    expect(flow.submitAnswer).toHaveBeenCalledWith({
      topicId: "t1",
      gapId: "g1",
      mode: "socratic",
      answer: "/done",
    });
  });

  it("/done during a quiz falls through to the existing quiz nudge unchanged (AC 3)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onDone = vi.fn().mockResolvedValue(undefined);
    deps.onDone = onDone;
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

    await handleUpdate(update({ text: "/done" }), deps);

    expect(onDone).not.toHaveBeenCalled();
    expect(flow.submitAnswer).not.toHaveBeenCalled();
    expect((deps.sendMessage.mock.calls[0]![1] as string)).toContain("answer buttons");
  });

  it("/done with no onDone dep configured falls back to the decline reply (mirrors onSocraticText's unwired shape)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
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

    await handleUpdate(update({ text: "/done" }), deps);

    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, DECLINE_REPLY);
  });

  it("skip inside an active socratic session dispatches to onSkip and never touches the pending flow (AC 19, 20)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onSkip = vi.fn().mockResolvedValue(undefined);
    deps.onSkip = onSkip;
    const socraticContext = {
      mode: "socratic" as const,
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    };
    deps.getChatContext = vi.fn().mockResolvedValue(socraticContext);

    await handleUpdate(update({ text: "skip" }), deps);

    expect(onSkip).toHaveBeenCalledWith(OWNER, socraticContext);
    expect(flow.getPending).not.toHaveBeenCalled();
    expect(flow.submitAnswer).not.toHaveBeenCalled();
  });

  it("skip while idle with a pending question clears it and acknowledges without submitting an answer (AC 21)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: null,
      label: null,
      messageId: null,
    });

    await handleUpdate(update({ text: "skip" }), deps);

    expect(flow.clearPending).toHaveBeenCalledWith(OWNER);
    expect(flow.submitAnswer).not.toHaveBeenCalled();
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, "No problem — I'll skip this one.");
  });

  it("skip while idle with nothing pending still acknowledges and performs no writes (AC 22)", async () => {
    const flow = makeFlow();
    flow.getPending = vi.fn().mockResolvedValue(null);
    const deps = makeDeps(flow);
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: null,
      label: null,
      messageId: null,
    });

    await handleUpdate(update({ text: "skip" }), deps);

    expect(flow.clearPending).not.toHaveBeenCalled();
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, "No problem — I'll skip this one.");
  });

  it("skip mid-quiz falls through to the existing quiz-text handling unchanged (AC 23)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onSkip = vi.fn().mockResolvedValue(undefined);
    deps.onSkip = onSkip;
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

    await handleUpdate(update({ text: "skip" }), deps);

    expect(onSkip).not.toHaveBeenCalled();
    expect(flow.submitAnswer).not.toHaveBeenCalled();
    expect((deps.sendMessage.mock.calls[0]![1] as string)).toContain("answer buttons");
  });

  it("skip in an active socratic session with no onSkip dep configured falls back to the decline reply (AC 24)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
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

    await handleUpdate(update({ text: "skip" }), deps);

    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, DECLINE_REPLY);
  });

  it("intercepts a steer-shaped message during an active socratic session via onSteer, ahead of the study/continue dispatch (AC 13, Decision 2 Step 4)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onSteer = vi.fn().mockResolvedValue(true);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onSteer = onSteer;
    deps.onStudy = onStudy;
    const socraticContext = {
      mode: "socratic" as const,
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    };
    deps.getChatContext = vi.fn().mockResolvedValue(socraticContext);

    await handleUpdate(update({ text: "let's talk about AWS Lambda" }), deps);

    expect(onSteer).toHaveBeenCalledWith(OWNER, socraticContext, "let's talk about AWS Lambda");
    expect(onStudy).not.toHaveBeenCalled();
  });

  it("falls through to the existing study path when onSteer finds no match (AC 16)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onSteer = vi.fn().mockResolvedValue(false);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onSteer = onSteer;
    deps.onStudy = onStudy;
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "socratic" as const,
      sessionId: "ss1",
      currentItemId: "turn1",
      scopeKind: "topic",
      scopeId: "t1",
      navCurriculumId: "c1",
      label: "x",
      messageId: 5,
    });

    await handleUpdate(update({ text: "let's talk about quantum stuff" }), deps);

    expect(onSteer).toHaveBeenCalledOnce();
    expect(onStudy).toHaveBeenCalledWith(OWNER, "quantum stuff");
  });

  it("never calls onSteer outside an active socratic session (AC 17)", async () => {
    const flow = makeFlow();
    const deps = makeDeps(flow);
    const onSteer = vi.fn().mockResolvedValue(false);
    const onStudy = vi.fn().mockResolvedValue(undefined);
    deps.onSteer = onSteer;
    deps.onStudy = onStudy;
    deps.getChatContext = vi.fn().mockResolvedValue({
      mode: "idle",
      sessionId: null,
      currentItemId: null,
      scopeKind: null,
      scopeId: null,
      navCurriculumId: null,
      label: null,
      messageId: null,
    });

    await handleUpdate(update({ text: "let's talk about AWS Lambda" }), deps);

    expect(onSteer).not.toHaveBeenCalled();
    expect(onStudy).toHaveBeenCalledWith(OWNER, "AWS Lambda");
  });

  it("falls back to the fixed apology when the flow throws", async () => {
    const flow = makeFlow();
    flow.submitAnswer = vi.fn().mockRejectedValue(new Error("api down"));
    const deps = makeDeps(flow);
    await handleUpdate(update({ text: "answer" }), deps);
    expect(deps.sendMessage).toHaveBeenCalledWith(OWNER, ERROR_REPLY);
  });
});
