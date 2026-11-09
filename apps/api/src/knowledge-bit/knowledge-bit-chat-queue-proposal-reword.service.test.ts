import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatQueueProposal } from "@post-anki/shared";

const lockChatState = vi.fn();
const getAssistantProposals = vi.fn();
const saveAssistantProposals = vi.fn();
const runKnowledgeBitChatReword = vi.fn();

vi.mock("../db/client.js", () => ({
  getDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }),
}));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  lockChatState: (...args: unknown[]) => lockChatState(...args),
}));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({
  getAssistantProposals: (...args: unknown[]) => getAssistantProposals(...args),
  saveAssistantProposals: (...args: unknown[]) => saveAssistantProposals(...args),
}));
vi.mock("../mastra/knowledge-bit-chat-reword.agent.js", () => ({
  runKnowledgeBitChatReword: (...args: unknown[]) => runKnowledgeBitChatReword(...args),
}));

const { rewordChatQueueProposal } = await import("./knowledge-bit-chat-queue-proposal-reword.service.js");

const proposal = (over: Partial<ChatQueueProposal> = {}): ChatQueueProposal => ({
  index: 0,
  kind: "create",
  front: "What does TCP establish?",
  back: "A reliable connection",
  example: "Browser opens a site",
  status: "pending",
  ...over,
});

describe("rewordChatQueueProposal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    lockChatState.mockResolvedValue("chat");
    getAssistantProposals.mockResolvedValue([proposal(), proposal({ index: 1, front: "Other?", back: "Other" })]);
  });

  it("should give the proposed card a new question, keep its answer, and leave other proposals alone", async () => {
    runKnowledgeBitChatReword.mockResolvedValue({ front: "Which guarantee does the TCP handshake give?" });

    const result = await rewordChatQueueProposal("kb1", 2, 0);

    expect(result).toEqual({
      ok: true,
      proposal: expect.objectContaining({
        front: "Which guarantee does the TCP handshake give?",
        back: "A reliable connection",
        example: "Browser opens a site",
        status: "pending",
      }),
    });
    expect(runKnowledgeBitChatReword).toHaveBeenCalledWith("What does TCP establish?", "A reliable connection", undefined);
    expect(saveAssistantProposals).toHaveBeenCalledWith(
      "kb1",
      2,
      [expect.objectContaining({ index: 0, front: "Which guarantee does the TCP handshake give?" }), proposal({ index: 1, front: "Other?", back: "Other" })],
      {},
    );
  });

  it("should retry once with feedback when the model repeats the old question", async () => {
    runKnowledgeBitChatReword
      .mockResolvedValueOnce({ front: "what does tcp establish?" })
      .mockResolvedValueOnce({ front: "What does the three-way handshake set up?" });

    const result = await rewordChatQueueProposal("kb1", 2, 0);

    expect(result).toMatchObject({ ok: true, proposal: { front: "What does the three-way handshake set up?" } });
    expect(runKnowledgeBitChatReword).toHaveBeenLastCalledWith(
      "What does TCP establish?",
      "A reliable connection",
      expect.stringContaining("same as the old one"),
    );
  });

  it("should not save anything when the model never produces a usable new question", async () => {
    runKnowledgeBitChatReword.mockResolvedValue({ front: "What does TCP establish?" });

    expect(await rewordChatQueueProposal("kb1", 2, 0)).toEqual({ ok: false, error: "generation_failed" });
    expect(saveAssistantProposals).not.toHaveBeenCalled();
  });

  it("should refuse to reword a card that was already accepted or rejected", async () => {
    getAssistantProposals.mockResolvedValue([proposal({ status: "accepted" })]);

    expect(await rewordChatQueueProposal("kb1", 2, 0)).toEqual({ ok: false, error: "proposal_not_pending" });
    expect(runKnowledgeBitChatReword).not.toHaveBeenCalled();
  });

  it("should report not found for an unknown proposal and a card outside the chat", async () => {
    expect(await rewordChatQueueProposal("kb1", 2, 5)).toEqual({ ok: false, error: "not_found" });

    lockChatState.mockResolvedValue("rejected");

    expect(await rewordChatQueueProposal("kb1", 2, 0)).toEqual({ ok: false, error: "not_in_chat" });
  });
});
