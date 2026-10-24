import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const purgeKnowledgeBits = vi.fn();
const deleteKnowledgeSource = vi.fn();
const clearAllKnowledge = vi.fn();

vi.mock("./knowledge-cleanup.repo.js", () => ({
  purgeKnowledgeBits: (...args: unknown[]) => purgeKnowledgeBits(...args),
  deleteKnowledgeSource: (...args: unknown[]) => deleteKnowledgeSource(...args),
  clearAllKnowledge: (...args: unknown[]) => clearAllKnowledge(...args),
}));

const { handleClearAllKnowledge, handleDeleteKnowledgeSource, handlePurgeKnowledgeBits } = await import(
  "./knowledge-cleanup.controller.js"
);

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

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

describe("handlePurgeKnowledgeBits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the counts of what was removed for the selected pieces", async () => {
    purgeKnowledgeBits.mockResolvedValue({ knowledgeBits: 2 });

    const res = fakeRes();

    await handlePurgeKnowledgeBits(fakeReq({ ids: ["kb_1", "kb_2"] }), res);

    expect(purgeKnowledgeBits).toHaveBeenCalledWith(["kb_1", "kb_2"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ counts: { knowledgeBits: 2 } });
  });

  it("should reject an empty or oversized selection without deleting anything", async () => {
    const empty = fakeRes();
    const huge = fakeRes();

    await handlePurgeKnowledgeBits(fakeReq({ ids: [] }), empty);
    await handlePurgeKnowledgeBits(
      fakeReq({ ids: Array.from({ length: 501 }, (_, i) => `kb_${i}`) }),
      huge,
    );

    expect(empty.status).toBe(400);
    expect(huge.status).toBe(400);
    expect(purgeKnowledgeBits).not.toHaveBeenCalled();
  });
});

describe("handleDeleteKnowledgeSource", () => {
  it("should delete the source by id and report counts even when it no longer exists", async () => {
    deleteKnowledgeSource.mockResolvedValue({ knowledgeSources: 0 });

    const res = fakeRes();

    await handleDeleteKnowledgeSource(res, "ksrc_1");

    expect(deleteKnowledgeSource).toHaveBeenCalledWith("ksrc_1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ counts: { knowledgeSources: 0 } });
  });
});

describe("handleClearAllKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should wipe everything only when the confirmation phrase is exact", async () => {
    clearAllKnowledge.mockResolvedValue({ knowledgeBits: 9 });

    const res = fakeRes();

    await handleClearAllKnowledge(fakeReq({ confirm: "DELETE ALL KNOWLEDGE" }), res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ counts: { knowledgeBits: 9 } });
  });

  it("should refuse with 400 when the confirmation is missing or wrong", async () => {
    const missing = fakeRes();
    const wrong = fakeRes();

    await handleClearAllKnowledge(fakeReq({}), missing);
    await handleClearAllKnowledge(fakeReq({ confirm: "yes" }), wrong);

    expect(missing.status).toBe(400);
    expect(wrong.status).toBe(400);
    expect(clearAllKnowledge).not.toHaveBeenCalled();
  });
});
