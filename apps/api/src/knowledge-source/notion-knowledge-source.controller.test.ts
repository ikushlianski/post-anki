import { Readable } from "node:stream";
import type http from "node:http";
import { APIErrorCode, APIResponseError } from "@notionhq/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DATA_SOURCE_ID = "3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

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

function rowRange(from: number, to: number) {
  return Array.from({ length: to - from }, (_, i) => row(`r-${from + i}`, `Idea ${from + i}`));
}

function queryPage(
  results: ReturnType<typeof row>[],
  { hasMore = false, nextCursor = null }: { hasMore?: boolean; nextCursor?: string | null } = {},
) {
  return { results, has_more: hasMore, next_cursor: nextCursor };
}

function insertedRowsFor(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ks_${i}`,
    kind: "notion",
    rawText: `Idea ${i}`,
    status: "pending",
    createdAt: new Date(),
  }));
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
    mockQuery.mockResolvedValue(
      queryPage([row("r-1", "Idea one"), row("r-2", "Idea two"), row("r-3", "Idea three")]),
    );
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue([
      { id: "ks_1", kind: "notion", rawText: "Idea one", status: "pending", createdAt: new Date() },
      { id: "ks_2", kind: "notion", rawText: "Idea two", status: "pending", createdAt: new Date() },
      { id: "ks_3", kind: "notion", rawText: "Idea three", status: "pending", createdAt: new Date() },
    ]);

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), res);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ data_source_id: DATA_SOURCE_ID }),
    );
    expect(mockInsertKnowledgeSourcesFromNotion).toHaveBeenCalledWith(
      [
        { id: "r-1", text: "Idea one", tags: [] },
        { id: "r-2", text: "Idea two", tags: [] },
        { id: "r-3", text: "Idea three", tags: [] },
      ],
      DATA_SOURCE_ID,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 3, truncated: false, nextCursor: null });
  });

  it("returns created: 0 and inserts nothing for a database with no rows", async () => {
    mockQuery.mockResolvedValue(queryPage([]));
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue([]);

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), res);

    expect(mockInsertKnowledgeSourcesFromNotion).toHaveBeenCalledWith([], DATA_SOURCE_ID);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 0, truncated: false, nextCursor: null });
  });

  it("reads pages only until the cap is crossed, then reports truncated with the cursor of the page holding the first dropped row", async () => {
    mockQuery
      .mockResolvedValueOnce(queryPage(rowRange(0, 300), { hasMore: true, nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(queryPage(rowRange(300, 600), { hasMore: true, nextCursor: "cursor-3" }));
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue(insertedRowsFor(500));

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), res);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1]?.[0]).toMatchObject({ start_cursor: "cursor-2" });

    const inserted = mockInsertKnowledgeSourcesFromNotion.mock.calls[0]?.[0] as { id: string }[];

    expect(inserted).toHaveLength(500);
    expect(inserted[0]?.id).toBe("r-0");
    expect(inserted[499]?.id).toBe("r-499");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 500, truncated: true, nextCursor: "cursor-2" });
  });

  it("resumes from a start cursor and reports no further cursor once the last page is read", async () => {
    mockQuery.mockResolvedValueOnce(queryPage(rowRange(600, 605)));
    mockInsertKnowledgeSourcesFromNotion.mockResolvedValue(insertedRowsFor(5));

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(
      fakeReq({ dataSourceId: DATA_SOURCE_ID, startCursor: "cursor-2" }),
      res,
    );

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ data_source_id: DATA_SOURCE_ID, start_cursor: "cursor-2" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 5, truncated: false, nextCursor: null });
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

  it("400s on a dataSourceId that is not a Notion id, without calling Notion", async () => {
    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: "bad-id" }), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("400s (not 500) when Notion rejects the data source id, without inserting anything", async () => {
    mockQuery.mockRejectedValue(notionError(APIErrorCode.ObjectNotFound));

    const res = fakeRes();
    await handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_notion_source");
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("re-throws an Unauthorized from Notion so a bad token surfaces as a 500, not a 400, without inserting anything", async () => {
    mockQuery.mockRejectedValue(notionError(APIErrorCode.Unauthorized, 401));

    await expect(
      handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), fakeRes()),
    ).rejects.toMatchObject({ code: APIErrorCode.Unauthorized });
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("re-throws a real Notion API error that isn't about a bad dataSourceId (e.g. rate limiting), instead of masking it as a 400", async () => {
    mockQuery.mockRejectedValue(notionError(APIErrorCode.RateLimited, 429));

    await expect(
      handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), fakeRes()),
    ).rejects.toMatchObject({ code: APIErrorCode.RateLimited });
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });

  it("re-throws a plain error from a misconfigured Notion client (e.g. missing token), instead of masking it as a 400", async () => {
    mockQuery.mockRejectedValue(new Error("NOTION_TOKEN is not set"));

    await expect(
      handleCreateKnowledgeSourceFromNotion(fakeReq({ dataSourceId: DATA_SOURCE_ID }), fakeRes()),
    ).rejects.toThrow("NOTION_TOKEN is not set");
    expect(mockInsertKnowledgeSourcesFromNotion).not.toHaveBeenCalled();
  });
});
