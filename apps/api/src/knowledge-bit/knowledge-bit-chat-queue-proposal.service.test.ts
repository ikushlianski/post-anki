import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatQueueProposal } from "@post-anki/shared";

const lockChatState = vi.fn();
const getAssistantProposals = vi.fn();
const saveAssistantProposals = vi.fn();
const insertApprovedChatCard = vi.fn();
const applyChatCardRevision = vi.fn();
const getChatCardSourceId = vi.fn();
const embedApprovedKnowledgeBits = vi.fn();

vi.mock("../db/client.js", () => ({
  getDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }),
}));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./knowledge-bit-approval-embedding.orchestrator.js", () => ({
  embedApprovedKnowledgeBits: (...args: unknown[]) => embedApprovedKnowledgeBits(...args),
}));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  lockChatState: (...args: unknown[]) => lockChatState(...args),
}));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({
  getAssistantProposals: (...args: unknown[]) => getAssistantProposals(...args),
  saveAssistantProposals: (...args: unknown[]) => saveAssistantProposals(...args),
}));
vi.mock("./knowledge-bit-chat-card.repo.js", () => ({
  insertApprovedChatCard: (...args: unknown[]) => insertApprovedChatCard(...args),
  applyChatCardRevision: (...args: unknown[]) => applyChatCardRevision(...args),
  getChatCardSourceId: (...args: unknown[]) => getChatCardSourceId(...args),
}));

const { decideChatQueueProposal } = await import("./knowledge-bit-chat-queue-proposal.service.js");

const proposal = (over: Partial<ChatQueueProposal> = {}): ChatQueueProposal => ({
  index: 0,
  kind: "create",
  front: "Q",
  back: "A",
  status: "pending",
  ...over,
});

describe("decideChatQueueProposal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    lockChatState.mockResolvedValue("chat");
    getAssistantProposals.mockResolvedValue([proposal()]);
    getChatCardSourceId.mockResolvedValue("src1");
    insertApprovedChatCard.mockResolvedValue({ id: "kb_new", created: true });
    applyChatCardRevision.mockResolvedValue({ ok: true });
  });

  it("should save an accepted new card once as an approved card and mark the proposal accepted", async () => {
    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(result).toEqual({ ok: true, value: { ok: true, status: "accepted", savedCardId: "kb_new" } });
    expect(insertApprovedChatCard).toHaveBeenCalledTimes(1);
    expect(insertApprovedChatCard).toHaveBeenCalledWith({}, "src1", { front: "Q", back: "A", example: undefined });
    expect(saveAssistantProposals).toHaveBeenCalledWith(
      "kb1",
      2,
      [expect.objectContaining({ status: "accepted", savedCardId: "kb_new" })],
      {},
    );
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_new"]);
  });

  it("should not save a second card when the same accept is sent again", async () => {
    getAssistantProposals.mockResolvedValue([proposal({ status: "accepted", savedCardId: "kb_new" })]);

    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(result).toEqual({ ok: true, value: { ok: true, status: "accepted", savedCardId: "kb_new" } });
    expect(insertApprovedChatCard).not.toHaveBeenCalled();
    expect(saveAssistantProposals).not.toHaveBeenCalled();
    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should not re-embed when accepting matched an already approved identical card", async () => {
    insertApprovedChatCard.mockResolvedValue({ id: "kb_old", created: false });

    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(result.ok && result.value.savedCardId).toBe("kb_old");
    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should rewrite the thread's own card when an update proposal is accepted", async () => {
    getAssistantProposals.mockResolvedValue([proposal({ kind: "update", example: "Ex" })]);

    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(applyChatCardRevision).toHaveBeenCalledWith({}, "kb1", { front: "Q", back: "A", example: "Ex" });
    expect(insertApprovedChatCard).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: { ok: true, status: "accepted", savedCardId: "kb1" } });
  });

  it("should refuse an update on a cloze or list card and leave the proposal pending", async () => {
    getAssistantProposals.mockResolvedValue([proposal({ kind: "update" })]);
    applyChatCardRevision.mockResolvedValue({ ok: false, error: "wrong_shape" });

    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(result).toEqual({ ok: false, error: "wrong_shape" });
    expect(saveAssistantProposals).not.toHaveBeenCalled();
  });

  it("should refuse an update in an approved review chat", async () => {
    lockChatState.mockResolvedValue("approved");
    getAssistantProposals.mockResolvedValue([proposal({ kind: "update" })]);

    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(result).toEqual({ ok: false, error: "not_in_chat" });
    expect(applyChatCardRevision).not.toHaveBeenCalled();
  });

  it("should only flip the status on reject and touch no card", async () => {
    const result = await decideChatQueueProposal("kb1", 2, 0, "reject");

    expect(result).toEqual({ ok: true, value: { ok: true, status: "rejected" } });
    expect(saveAssistantProposals).toHaveBeenCalledWith("kb1", 2, [expect.objectContaining({ status: "rejected" })], {});
    expect(insertApprovedChatCard).not.toHaveBeenCalled();
    expect(applyChatCardRevision).not.toHaveBeenCalled();
    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should report not pending when accepting a rejected proposal or rejecting an accepted one", async () => {
    getAssistantProposals.mockResolvedValue([proposal({ status: "rejected" })]);
    expect(await decideChatQueueProposal("kb1", 2, 0, "accept")).toEqual({ ok: false, error: "proposal_not_pending" });

    getAssistantProposals.mockResolvedValue([proposal({ status: "accepted", savedCardId: "x" })]);
    expect(await decideChatQueueProposal("kb1", 2, 0, "reject")).toEqual({ ok: false, error: "proposal_not_pending" });
  });

  it("should refuse when the card has left the chat", async () => {
    lockChatState.mockResolvedValue("rejected");

    expect(await decideChatQueueProposal("kb1", 2, 0, "accept")).toEqual({ ok: false, error: "not_in_chat" });
    expect(insertApprovedChatCard).not.toHaveBeenCalled();
  });

  it("should report not found for a missing card, message or proposal index", async () => {
    lockChatState.mockResolvedValueOnce(null);
    expect(await decideChatQueueProposal("kb1", 2, 0, "accept")).toEqual({ ok: false, error: "not_found" });

    getAssistantProposals.mockResolvedValueOnce(null);
    expect(await decideChatQueueProposal("kb1", 9, 0, "accept")).toEqual({ ok: false, error: "not_found" });

    expect(await decideChatQueueProposal("kb1", 2, 1, "accept")).toEqual({ ok: false, error: "not_found" });
  });

  it("should keep the saved card when embedding fails after accept", async () => {
    embedApprovedKnowledgeBits.mockRejectedValue(new Error("down"));

    const result = await decideChatQueueProposal("kb1", 2, 0, "accept");

    expect(result.ok).toBe(true);
  });
});
