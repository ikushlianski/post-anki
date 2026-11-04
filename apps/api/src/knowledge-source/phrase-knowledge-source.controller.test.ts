import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PHRASE_LINES } from "@post-anki/shared";

vi.mock("../subject/seed/english-sub-subjects.seed.js", () => ({
  ensureEnglishForItSubject: vi.fn(),
}));
vi.mock("./phrase-knowledge-source.repo.js", () => ({
  insertPhraseKnowledgeSources: vi.fn(),
}));
vi.mock("./knowledge-source-kick.js", () => ({
  kickSourcesAfterAdd: vi.fn(),
}));

const { ensureEnglishForItSubject } = await import("../subject/seed/english-sub-subjects.seed.js");
const { insertPhraseKnowledgeSources } = await import("./phrase-knowledge-source.repo.js");
const { kickSourcesAfterAdd } = await import("./knowledge-source-kick.js");
const { handleCreateKnowledgeSourcesFromPhrases } = await import(
  "./phrase-knowledge-source.controller.js"
);

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
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

function createdRows(ids: string[]) {
  return ids.map((id) => ({
    id,
    kind: "phrase",
    rawText: "Phrase: x",
    status: "pending",
    createdAt: new Date(),
    subjectId: "sub_it",
    extractionModelId: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureEnglishForItSubject).mockResolvedValue("sub_it");
});

describe("handleCreateKnowledgeSourcesFromPhrases", () => {
  it("should refuse an empty post so nothing is created", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSourcesFromPhrases(fakeReq({ lines: [] }), res);

    expect(res.status).toBe(400);
    expect(insertPhraseKnowledgeSources).not.toHaveBeenCalled();
  });

  it("should refuse a post over the line cap", async () => {
    const res = fakeRes();
    const lines = Array.from({ length: MAX_PHRASE_LINES + 1 }, (_, i) => `phrase ${i}`);

    await handleCreateKnowledgeSourcesFromPhrases(fakeReq({ lines }), res);

    expect(res.status).toBe(400);
    expect(kickSourcesAfterAdd).not.toHaveBeenCalled();
  });

  it("should answer 400 when no line holds a phrase", async () => {
    const res = fakeRes();

    await handleCreateKnowledgeSourcesFromPhrases(fakeReq({ lines: ["", "привет"] }), res);

    expect(res.status).toBe(400);
    expect(ensureEnglishForItSubject).not.toHaveBeenCalled();
  });

  it("should start extraction only for newly created phrases", async () => {
    vi.mocked(insertPhraseKnowledgeSources).mockResolvedValue(createdRows(["ks_1"]));

    const res = fakeRes();

    await handleCreateKnowledgeSourcesFromPhrases(
      fakeReq({ lines: ["touch base", "circle back", "", "touch base"] }),
      res,
    );

    expect(kickSourcesAfterAdd).toHaveBeenCalledWith(["ks_1"]);
    expect(res.body).toEqual({
      received: 4,
      imported: 1,
      skippedExisting: 1,
      ignored: 1,
      duplicatesInInput: 1,
    });
  });

  it("should ignore one over-long line and still import the other phrases", async () => {
    vi.mocked(insertPhraseKnowledgeSources).mockResolvedValue(createdRows(["ks_1"]));

    const res = fakeRes();

    await handleCreateKnowledgeSourcesFromPhrases(
      fakeReq({ lines: ["touch base", `circle back ${"x".repeat(600)}`] }),
      res,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: 2, imported: 1, ignored: 1 });
  });

  it("should add nothing and start no job when every phrase already exists", async () => {
    vi.mocked(insertPhraseKnowledgeSources).mockResolvedValue([]);

    const res = fakeRes();

    await handleCreateKnowledgeSourcesFromPhrases(fakeReq({ lines: ["touch base"] }), res);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ imported: 0, skippedExisting: 1 });
    expect(kickSourcesAfterAdd).not.toHaveBeenCalled();
  });
});
