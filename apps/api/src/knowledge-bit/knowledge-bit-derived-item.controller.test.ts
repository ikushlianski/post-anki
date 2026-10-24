import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingKnowledgeBitForReview } from "@post-anki/shared";

vi.mock("./knowledge-bit-manual-item.repo.js", () => ({ insertDerivedKnowledgeItem: vi.fn() }));

const { insertDerivedKnowledgeItem } = await import("./knowledge-bit-manual-item.repo.js");
const { handleCreateDerivedKnowledgeItem } = await import("./knowledge-bit-derived-item.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

const createdItem: PendingKnowledgeBitForReview = {
  id: "kb_new",
  body: "Q\nA",
  background: null,
  variants: [{ id: "kbqv_1", kind: "basic", prompt: "Q", answer: "A" }],
  feedback: null,
  origin: "manual",
  isAiGenerated: true,
  sourceLinks: ["https://example.com/a"],
};

describe("handleCreateDerivedKnowledgeItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reply 201 with the new pending card and pass the AI flag and links through", async () => {
    vi.mocked(insertDerivedKnowledgeItem).mockResolvedValue({ ok: true, item: createdItem });

    const res = fakeRes();

    await handleCreateDerivedKnowledgeItem(
      fakeReq({ front: "Q", back: "A", aiGenerated: true, sourceLinks: ["https://example.com/a"] }),
      res,
      "kb_1",
    );

    expect(res.status).toBe(201);
    expect(res.body).toEqual(createdItem);
    expect(insertDerivedKnowledgeItem).toHaveBeenCalledWith("kb_1", {
      front: "Q",
      back: "A",
      aiGenerated: true,
      sourceLinks: ["https://example.com/a"],
    });
  });

  it("should reply 400 and write nothing when the card has no back", async () => {
    const res = fakeRes();

    await handleCreateDerivedKnowledgeItem(fakeReq({ front: "Q" }), res, "kb_1");

    expect(res.status).toBe(400);
    expect(insertDerivedKnowledgeItem).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["not_approved", 409],
  ] as const)("should reply %s with status %i", async (error, status) => {
    vi.mocked(insertDerivedKnowledgeItem).mockResolvedValue({ ok: false, error });

    const res = fakeRes();

    await handleCreateDerivedKnowledgeItem(fakeReq({ front: "Q", back: "A" }), res, "kb_1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });
});
