import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-chat-queue-proposal.service.js", () => ({ decideChatQueueProposal: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-chat-queue-proposal-reword.service.js", () => ({ rewordChatQueueProposal: vi.fn() }));

const { decideChatQueueProposal } = await import("../knowledge-bit/knowledge-bit-chat-queue-proposal.service.js");
const { rewordChatQueueProposal } = await import("../knowledge-bit/knowledge-bit-chat-queue-proposal-reword.service.js");
const { resolveCardProposal } = await import("./resolve-card-proposal.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };
const base = { cardId: "kb_1", messageSeq: 2, proposalIndex: 0 };

describe("resolveCardProposal", () => {
  it("should refuse without cards:write and touch nothing", async () => {
    expect(await resolveCardProposal({ ...base, action: "accept" }, { scopes: ["knowledge:write"] })).toEqual({ error: "missing_scope" });
    expect(decideChatQueueProposal).not.toHaveBeenCalled();
  });

  it("should save the card when a proposal is accepted", async () => {
    vi.mocked(decideChatQueueProposal).mockResolvedValue({ ok: true, value: { ok: true, status: "accepted", savedCardId: "kb_9" } });

    expect(await resolveCardProposal({ ...base, action: "accept" }, auth)).toEqual({ action: "accept", status: "accepted", savedCardId: "kb_9" });
    expect(decideChatQueueProposal).toHaveBeenCalledWith("kb_1", 2, 0, "accept");
  });

  it("should reject a proposal without saving a card", async () => {
    vi.mocked(decideChatQueueProposal).mockResolvedValue({ ok: true, value: { ok: true, status: "rejected" } });

    expect(await resolveCardProposal({ ...base, action: "reject" }, auth)).toEqual({ action: "reject", status: "rejected" });
  });

  it("should return the reworded proposal still pending", async () => {
    const proposal = { index: 0, kind: "create" as const, front: "Q2", back: "A2", status: "pending" as const };

    vi.mocked(rewordChatQueueProposal).mockResolvedValue({ ok: true, proposal });

    expect(await resolveCardProposal({ ...base, action: "reword" }, auth)).toEqual({ action: "reword", status: "pending", proposal });
  });

  it("should report a proposal that is no longer pending", async () => {
    vi.mocked(decideChatQueueProposal).mockResolvedValue({ ok: false, error: "proposal_not_pending" });

    expect(await resolveCardProposal({ ...base, action: "accept" }, auth)).toEqual({ error: "proposal_not_pending" });
  });

  it("should report a reword failure such as the AI budget", async () => {
    vi.mocked(rewordChatQueueProposal).mockResolvedValue({ ok: false, error: "budget_exceeded" });

    expect(await resolveCardProposal({ ...base, action: "reword" }, auth)).toEqual({ error: "budget_exceeded" });
  });
});
