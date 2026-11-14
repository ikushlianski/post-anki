import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-chat-queue-web-tools.js", () => ({ createChatQueueWebTools: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-chat-queue.repo.js", () => ({ loadChatCardContext: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-chat-queue.service.js", () => ({ sendChatQueueMessage: vi.fn() }));

const { sendChatQueueMessage } = await import("../knowledge-bit/knowledge-bit-chat-queue.service.js");
const { loadChatCardContext } = await import("../knowledge-bit/knowledge-bit-chat-queue.repo.js");
const { createChatQueueWebTools } = await import("../knowledge-bit/knowledge-bit-chat-queue-web-tools.js");
const { chatAboutCard } = await import("./chat-about-card.tool.js");

beforeEach(() => {
  vi.mocked(createChatQueueWebTools).mockReturnValue({ deps: {}, getUsage: () => ({ searches: 0, fetches: 0 }) } as never);
});

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["knowledge:write"] };

describe("chatAboutCard", () => {
  it("should refuse without knowledge:write and not call the model", async () => {
    expect(await chatAboutCard({ cardId: "kb_1", message: "hi" }, { scopes: [] })).toEqual({ error: "missing_scope" });
    expect(sendChatQueueMessage).not.toHaveBeenCalled();
  });

  it("should return the tutor reply with proposals", async () => {
    vi.mocked(loadChatCardContext).mockResolvedValue({ sourceUrl: null } as never);
    vi.mocked(sendChatQueueMessage).mockResolvedValue({
      ok: true,
      value: { reply: "Try this", replySeq: 2, proposals: [{ index: 0, kind: "create", front: "Q", back: "A", status: "pending" }], turnsLeft: 4, capReached: false },
    });

    const result = await chatAboutCard({ cardId: "kb_1", message: "improve", clientMessageId: "m1" }, auth);

    expect(sendChatQueueMessage).toHaveBeenCalledWith("kb_1", { clientMessageId: "m1", message: "improve" }, expect.anything());
    expect(result).toMatchObject({ reply: "Try this", turnsLeft: 4, proposals: [{ front: "Q" }] });
  });

  it("should report a chat failure such as the turn cap", async () => {
    vi.mocked(sendChatQueueMessage).mockResolvedValue({ ok: false, error: "cap_reached" });

    expect(await chatAboutCard({ cardId: "kb_1", message: "more" }, auth)).toEqual({ error: "cap_reached" });
  });
});
