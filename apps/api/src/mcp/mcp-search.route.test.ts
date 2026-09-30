import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CardSearchResult } from "../cards/card-search.repo.js";
import type { SearchCurriculumResult, SearchTopicResult } from "../search/search.repo.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  cardRows: [] as CardSearchResult[],
  courseRows: [] as SearchCurriculumResult[],
  topicRows: [] as SearchTopicResult[],
  capturedQuery: undefined as string | undefined,
  capturedCardLimit: undefined as number | undefined,
  capturedCourseQuery: undefined as string | undefined,
  capturedTopicQuery: undefined as string | undefined,
  searchCardsCalled: false,
  searchCurriculaCalled: false,
  searchTopicsCalled: false,
}));

vi.mock("../cards/card-search.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../cards/card-search.repo.js")>(
    "../cards/card-search.repo.js",
  );

  return {
    ...actual,
    searchCards: vi.fn(async (query: string, limit: number) => {
      state.capturedQuery = query;
      state.capturedCardLimit = limit;
      state.searchCardsCalled = true;

      return state.cardRows;
    }),
  };
});

vi.mock("../search/search.repo.js", () => ({
  searchCurricula: vi.fn(async (query: string) => {
    state.capturedCourseQuery = query;
    state.searchCurriculaCalled = true;

    return state.courseRows;
  }),
  searchTopics: vi.fn(async (query: string) => {
    state.capturedTopicQuery = query;
    state.searchTopicsCalled = true;

    return state.topicRows;
  }),
}));

vi.mock("../api-token/api-token.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../api-token/api-token.repo.js")>(
    "../api-token/api-token.repo.js",
  );

  return { ...actual, touchLastUsed: vi.fn(async () => {}) };
});

const { createApiServer } = await import("../api-server.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import(
  "@modelcontextprotocol/sdk/client/streamableHttp.js"
);

const SHARED_SECRET = process.env.API_SHARED_SECRET!;

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  state.cardRows = [];
  state.courseRows = [];
  state.topicRows = [];
  state.capturedQuery = undefined;
  state.capturedCardLimit = undefined;
  state.capturedCourseQuery = undefined;
  state.capturedTopicQuery = undefined;
  state.searchCardsCalled = false;
  state.searchCurriculaCalled = false;
  state.searchTopicsCalled = false;
  vi.clearAllMocks();
});

async function connectedClient(): Promise<InstanceType<typeof Client>> {
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
  });

  await client.connect(transport);

  return client;
}

describe("POST /mcp search_knowledge_items", () => {
  it("returns matching cards, courses, and topics through the real MCP client", async () => {
    state.cardRows = [
      {
        cardId: "card_1",
        topicId: "top_1",
        curriculumId: "cur_1",
        concept: "Closures",
        prompt: "What is a closure?",
        answer: "A bundled scope.",
      },
    ];
    state.courseRows = [{ id: "cur_1", name: "JavaScript" }];
    state.topicRows = [{ id: "top_1", title: "Closures", curriculumId: "cur_1" }];

    const client = await connectedClient();
    const result = await client.callTool({
      name: "search_knowledge_items",
      arguments: { query: "closure", limit: 7 },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      cards: state.cardRows,
      courses: state.courseRows,
      topics: state.topicRows,
    });
    expect(state.capturedQuery).toBe("closure");
    expect(state.capturedCardLimit).toBe(7);
    expect(state.capturedCourseQuery).toBe("closure");
    expect(state.capturedTopicQuery).toBe("closure");

    await client.close();
  });

  it("rejects a query shorter than 2 characters at the input schema, before any database call", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "search_knowledge_items", arguments: { query: "a" } });

    expect(result.isError).toBe(true);
    expect(state.searchCardsCalled).toBe(false);
    expect(state.searchCurriculaCalled).toBe(false);
    expect(state.searchTopicsCalled).toBe(false);

    await client.close();
  });

  it("rejects a negative limit at the input schema, before any database call", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "search_knowledge_items",
      arguments: { query: "closure", limit: -1 },
    });

    expect(result.isError).toBe(true);
    expect(state.searchCardsCalled).toBe(false);
    expect(state.searchCurriculaCalled).toBe(false);
    expect(state.searchTopicsCalled).toBe(false);

    await client.close();
  });

  it("accepts a query exactly 2 characters long and runs the database call", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "search_knowledge_items", arguments: { query: "ab" } });

    expect(result.isError).toBeFalsy();
    expect(state.searchCardsCalled).toBe(true);
    expect(state.searchCurriculaCalled).toBe(true);
    expect(state.searchTopicsCalled).toBe(true);

    await client.close();
  });

  it("returns a generic isError result, not the raw exception, when the card search fails", async () => {
    const { searchCards } = await import("../cards/card-search.repo.js");

    vi.mocked(searchCards).mockRejectedValueOnce(new Error("raw driver detail nobody should see"));

    const client = await connectedClient();
    const result = await client.callTool({
      name: "search_knowledge_items",
      arguments: { query: "closure" },
    });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).not.toContain("raw driver detail");
    expect(text).toContain("search_knowledge_items");

    await client.close();
  });
});
