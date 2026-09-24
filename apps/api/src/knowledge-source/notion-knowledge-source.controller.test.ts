import { Readable } from "node:stream";
import type http from "node:http";
import { APIErrorCode, APIResponseError } from "@notionhq/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

function notionError(code: APIErrorCode, status = 400): APIResponseError {
  return new APIResponseError({
    code,
    status,
    message: code,
    headers: new Headers(),
    rawBodyText: code,
    additional_data: undefined,
    request_id: undefined,
  });
}

const mockQuery = vi.fn();
const mockInsertKnowledgeSourcesFromNotion = vi.fn();

vi.mock("../notion-connector/notion.client.js", () => ({
  getNotionClient: () => ({ dataSources: { query: mockQuery } }),
}));

vi.mock("./knowledge-source.repo.js", () => ({
  insertKnowledgeSourcesFromNotion: (...args: unknown[]) =>
    mockInsertKnowledgeSourcesFromNotion(...args),
  MAX_ROWS_PER_IMPORT: 500,
}));

const { handleCreateKnowledgeSourceFromNotion } = await import(
  "./notion-knowledge-source.controller.js"
);

function row(id: string, title: string) {
  return {
    object: "page",
    url: `https://notion.so/${id}`,
    id,
    created_time: "2026-09-24T00:00:00.000Z",
    properties: {
      Note: { type: "title", title: [{ plain_text: title }] },
      Tags: { type: "multi_select", multi_select: [] },
    },
  };
}

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCreateKnowledgeSourceFromNotion", () => {
  it("imports every row from the given Notion data source, returning the created count", async () => {
    mockQuery.mockResolvedValue({
      results: [row("r-1", "Idea one"), row("r-2", "Idea two"), row("r-3", "Idea three")],
      has_more: false,
      next_cursor: null,
    });
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue([
      { id: "ks_1", kind: "notion", rawText: "Idea one", status: "pending", createdAt: new Date() },
      { id: "ks_2", kind: "notion", rawText: "Idea two", status: "pending", createdAt: new Date() },
      { id: "ks_3", kind: "notion", rawText: "Idea three", status: "pending", createdAt: new Date() },
    ]);

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "ds-1" }), res);

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ data_source_id: "ds-1" }));
    expect(mockInsertKnowledgeSourcesFromNotion).toHaveBeenCalledWith(
      [
        { id: "r-1", text: "Idea one", tags: [] },
        { id: "r-2", text: "Idea two", tags: [] },
        { id: "r-3", text: "Idea three", tags: [] },
      ],
      "ds-1",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 3, truncated: false });
  });

  it("returns created: 0 and inserts nothing for a database with no rows", async () => {
    mockQuery.mockResolvedValue({ results: [], has_more: false, next_cursor: null });
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue([]);

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "ds-empty" }), res);

    expect(mockInsertKnowledgeSourcesFromNotion).toHaveBeenCalledWith([], "ds-empty");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 0, truncated: false });
  });

  it("stops reading from Notion at the row cap and reports truncated: true, instead of crawling the whole database", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => row(`r-${i}`, `Idea ${i}`));
    mockQuery.mockResolvedValue({ results: rows, has_more: false, next_cursor: null });
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => ({
        id: `ks_${i}`,
        kind: "notion",
        rawText: `Idea ${i}`,
        status: "pending",
        createdAt: new Date(),
      })),
    );

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "ds-big" }), res);

    expect(mockInsertKnowledgeSourcesFromNotion).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "r-0" })]),
      "ds-big",
    );
    expect((mockInsertKnowledgeSourcesFromNotion.mock.calls[0]?.[0] as unknown[]).length).toBe(500);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 500, truncated: true });
  });

  it("400s when dataSourceId is missing from the body", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({}), res);

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("400s on a whitespace-only dataSourceId, without calling Notion or inserting anything", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "   " }), res);

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("400s (not 500) when Notion rejects the data source id, without inserting anything", async () => {
    mockQuery.mockRejectedValue(notionError(APIErrorCode.ObjectNotFound));

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "bad-id" }), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_notion_source");
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("re-throws a real Notion API error that isn't about a bad dataSourceId (e.g. rate limiting), instead of masking it as a 400", async () => {
    mockQuery.mockRejectedValue(notionError(APIErrorCode.RateLimited, 429));

    await expect(
      handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "ds-1" }), fakeRes()),
    ).rejects.toMatchObject({ code: APIErrorCode.RateLimited });
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("re-throws a plain error from a misconfigured Notion client (e.g. missing token), instead of masking it as a 400", async () => {
    mockQuery.mockRejectedValue(new Error("NOTION_TOKEN is not set"));

    await expect(
      handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "ds-1" }), fakeRes()),
    ).rejects.toThrow("NOTION_TOKEN is not set");
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });
});
