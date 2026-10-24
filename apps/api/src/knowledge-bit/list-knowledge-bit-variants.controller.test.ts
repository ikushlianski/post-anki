import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit.repo.js", () => ({
  getKnowledgeBitById: vi.fn(),
}));

vi.mock("./knowledge-bit-question-variant.repo.js", () => ({
  listActiveVariantsForBit: vi.fn(),
}));

const { getKnowledgeBitById } = await import("./knowledge-bit.repo.js");
const { listActiveVariantsForBit } = await import("./knowledge-bit-question-variant.repo.js");
const { handleListKnowledgeBitVariants } = await import("./list-knowledge-bit-variants.controller.js");

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
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

describe("handleListKnowledgeBitVariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should list the reworded questions the learner can see as synonyms of an existing item", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue({
      id: "kb_1",
      body: "TTL means time to live.",
      approvalState: "approved",
      isAiGenerated: false,
      sourceLinks: [],
    });
    vi.mocked(listActiveVariantsForBit).mockResolvedValue([
      { id: "kbqv_1", kind: "basic", prompt: "What does TTL stand for?", answer: "Time to live." },
    ]);

    const res = fakeRes();

    await handleListKnowledgeBitVariants(res, "kb_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      variants: [{ id: "kbqv_1", kind: "basic", prompt: "What does TTL stand for?", answer: "Time to live." }],
    });
  });

  it("should answer 404 when the item does not exist", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue(null);

    const res = fakeRes();

    await handleListKnowledgeBitVariants(res, "kb_missing");

    expect(res.status).toBe(404);
  });
});
