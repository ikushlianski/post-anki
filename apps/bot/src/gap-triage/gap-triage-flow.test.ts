import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Gap } from "@post-anki/shared";

const mockSendMessageWithKeyboard = vi.fn();
const mockEditMessageText = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  sendMessageWithKeyboard: (...args: unknown[]) => mockSendMessageWithKeyboard(...args),
  editMessageText: (...args: unknown[]) => mockEditMessageText(...args),
}));

const mockTriageGap = vi.fn();
const mockMarkGapResurfaced = vi.fn();

vi.mock("../api/client.js", () => ({
  triageGap: (...args: unknown[]) => mockTriageGap(...args),
  markGapResurfaced: (...args: unknown[]) => mockMarkGapResurfaced(...args),
}));

vi.mock("../telegram/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const {
  sendGapTriageMessage,
  handleTriageCallback,
  handleCheckinCallback,
  runGapResurface,
} = await import("./gap-triage-flow.js");

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "t1",
    label: "async iterators",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    triageState: "user_deferred",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 1,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendGapTriageMessage", () => {
  it("sends exactly one standalone message with the resurface text and a keyboard", async () => {
    await sendGapTriageMessage(42, gap({ id: "g1" }), "TypeScript");

    expect(mockSendMessageWithKeyboard).toHaveBeenCalledTimes(1);
    expect(mockSendMessageWithKeyboard).toHaveBeenCalledWith(
      42,
      "Your deferred gap is back: async iterators (TypeScript)",
      expect.any(Array),
    );
  });
});

describe("handleTriageCallback", () => {
  it("edits the message to the Important confirmation and removes the keyboard when the tap changed something", async () => {
    mockTriageGap.mockResolvedValue({
      gap: gap({ id: "g1", triageState: "important" }),
      changed: true,
      tool: "TypeScript",
    });

    await handleTriageCallback(42, 100, "g1", "triage_important");

    expect(mockTriageGap).toHaveBeenCalledWith("g1", "important");
    expect(mockEditMessageText).toHaveBeenCalledWith(
      42,
      100,
      "Noted — TypeScript: async iterators is flagged as important.",
    );
  });

  it("edits to the exact Defer again confirmation with no separate message", async () => {
    mockTriageGap.mockResolvedValue({ gap: gap({ id: "g1" }), changed: true, tool: "TypeScript" });

    await handleTriageCallback(42, 100, "g1", "triage_defer");

    expect(mockEditMessageText).toHaveBeenCalledWith(42, 100, "Got it — deferred for 60 days.");
    expect(mockEditMessageText).toHaveBeenCalledTimes(1);
  });

  it("routes both Dismiss and the Actually dismiss? shortcut to the identical confirmation", async () => {
    mockTriageGap.mockResolvedValue({
      gap: gap({ id: "g1", triageState: "dismissed" }),
      changed: true,
      tool: "TypeScript",
    });

    await handleTriageCallback(42, 100, "g1", "triage_dismiss");
    await handleTriageCallback(42, 100, "g1", "triage_dismiss_shortcut");

    expect(mockTriageGap).toHaveBeenNthCalledWith(1, "g1", "dismiss");
    expect(mockTriageGap).toHaveBeenNthCalledWith(2, "g1", "dismiss");
    expect(mockEditMessageText).toHaveBeenNthCalledWith(
      1,
      42,
      100,
      "Dismissed. I'll trust your judgment on this one.",
    );
    expect(mockEditMessageText).toHaveBeenNthCalledWith(
      2,
      42,
      100,
      "Dismissed. I'll trust your judgment on this one.",
    );
  });

  it("does nothing further when the transition was a no-op (e.g. a duplicate webhook delivery)", async () => {
    mockTriageGap.mockResolvedValue({ gap: gap({ id: "g1" }), changed: false, tool: "TypeScript" });

    await handleTriageCallback(42, 100, "g1", "triage_important");

    expect(mockEditMessageText).not.toHaveBeenCalled();
  });
});

describe("handleCheckinCallback", () => {
  it("'Yes, still got it' only acknowledges — no triage write", async () => {
    await handleCheckinCallback(42, 100, "g1", "checkin_confirm");

    expect(mockTriageGap).not.toHaveBeenCalled();
    expect(mockEditMessageText).toHaveBeenCalledWith(
      42,
      100,
      "Good to know — I won't bring this one up again.",
    );
  });

  it("'Actually, let's revisit' reopens the gap and shows the reopened acknowledgment", async () => {
    mockTriageGap.mockResolvedValue({
      gap: gap({ id: "g1", triageState: "untriaged" }),
      changed: true,
      tool: "TypeScript",
    });

    await handleCheckinCallback(42, 100, "g1", "checkin_revisit");

    expect(mockTriageGap).toHaveBeenCalledWith("g1", "revisit");
    expect(mockEditMessageText).toHaveBeenCalledWith(
      42,
      100,
      "Reopened — I'll ask about it again.",
    );
  });
});

describe("runGapResurface", () => {
  it("marks resurfaced only for gaps whose Telegram send actually succeeded", async () => {
    mockSendMessageWithKeyboard
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("telegram down"));

    await runGapResurface(42, {
      userDeferredDue: [
        { gap: gap({ id: "ok" }), tool: "TypeScript" },
        { gap: gap({ id: "fails" }), tool: "TypeScript" },
      ],
      dismissedCheckinDue: [],
    });

    expect(mockMarkGapResurfaced).toHaveBeenCalledTimes(1);
    expect(mockMarkGapResurfaced).toHaveBeenCalledWith("ok", "deferral-expired");
  });

  it("sends the dismissed check-in message and marks the one-time check-in flag on success", async () => {
    mockSendMessageWithKeyboard.mockResolvedValue(1);

    await runGapResurface(42, {
      userDeferredDue: [],
      dismissedCheckinDue: [{ gap: gap({ id: "d1", triageState: "dismissed" }), tool: "Docker" }],
    });

    expect(mockSendMessageWithKeyboard).toHaveBeenCalledWith(
      42,
      "A few months back you dismissed this: async iterators (Docker). Still confident?",
      expect.any(Array),
    );
    expect(mockMarkGapResurfaced).toHaveBeenCalledWith("d1", "dismissed-checkin");
  });
});
