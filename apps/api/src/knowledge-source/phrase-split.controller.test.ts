import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsPhrase = vi.fn();
const mockListSplits = vi.fn();
const mockSplit = vi.fn();
const mockVariants = vi.fn();

vi.mock("../db/client.js", () => ({ getDb: () => ({}) }));
vi.mock("./phrase-split.repo.js", () => ({
  isLivePhraseKnowledgeBit: (...args: unknown[]) => mockIsPhrase(...args),
  listPhraseBitVariants: (...args: unknown[]) => mockVariants(...args),
}));
vi.mock("./phrase-sentence-backfill.repo.js", () => ({
  listPhraseContextSplits: (...args: unknown[]) => mockListSplits(...args),
}));
vi.mock("./phrase-context-split.orchestrator.js", () => ({
  splitPhraseContextsAndRefreshEmbeddings: (...args: unknown[]) => mockSplit(...args),
}));

const { handleCreateKnowledgeBitPhraseSplit } = await import("./phrase-split.controller.js");

function fakeRes() {
  const chunks: Buffer[] = [];
  let statusCode = 0;
  const res = {
    writeHead: (code: number) => {
      statusCode = code;
      return res;
    },
    end: (chunk: unknown) => {
      if (chunk) chunks.push(Buffer.from(chunk as string));
    },
    get statusCode() {
      return statusCode;
    },
    json() {
      return JSON.parse(chunks.map((c) => c.toString()).join(""));
    },
  };

  return res as unknown as http.ServerResponse & { statusCode: number; json(): unknown };
}

describe("handleCreateKnowledgeBitPhraseSplit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 and change nothing when the card is not a phrase card or does not exist", async () => {
    mockIsPhrase.mockResolvedValue(false);

    const res = fakeRes();
    await handleCreateKnowledgeBitPhraseSplit(res, "kb_1");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    expect(mockSplit).not.toHaveBeenCalled();
  });

  it("should split only the requested card and return the updated count with its variants", async () => {
    const splits = [{ variantId: "v1", bitId: "kb_1", prompt: "Front", context: "Situation" }];
    const variants = [{ id: "v1", prompt: "Front", context: "Situation" }];

    mockIsPhrase.mockResolvedValue(true);
    mockListSplits.mockResolvedValue(splits);
    mockSplit.mockResolvedValue(1);
    mockVariants.mockResolvedValue(variants);

    const res = fakeRes();
    await handleCreateKnowledgeBitPhraseSplit(res, "kb_1");

    expect(mockListSplits).toHaveBeenCalledWith({}, "kb_1");
    expect(mockSplit).toHaveBeenCalledWith(splits);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 1, variants });
  });

  it("should return zero updated when the card has nothing left to split", async () => {
    mockIsPhrase.mockResolvedValue(true);
    mockListSplits.mockResolvedValue([]);
    mockSplit.mockResolvedValue(0);
    mockVariants.mockResolvedValue([]);

    const res = fakeRes();
    await handleCreateKnowledgeBitPhraseSplit(res, "kb_1");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 0, variants: [] });
  });
});
