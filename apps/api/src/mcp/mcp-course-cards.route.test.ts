import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CardBrowserRow } from "@post-anki/shared";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  cardsForCurriculum: [] as CardBrowserRow[],
  curriculumExists: true,
}));

vi.mock("../cards/list-cards-for-curriculum.repo.js", () => ({
  listCardsForCurriculum: vi.fn(async () => state.cardsForCurriculum),
}));

vi.mock("../curriculum/curriculum-exists.repo.js", () => ({
  curriculumExists: vi.fn(async () => state.curriculumExists),
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
  state.cardsForCurriculum = [];
  state.curriculumExists = true;
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

describe("POST /mcp list_course_cards", () => {
  it("returns ready cards paged, with a correct total, through the real MCP client", async () => {
    state.cardsForCurriculum = Array.from({ length: 5 }, (_, i) => ({
      variantId: `var_${i}`,
      cardId: `card_${i}`,
      concept: `Concept ${i}`,
      prompt: `Prompt ${i}`,
      answer: `Answer ${i}`,
      topicId: "top_1",
      topicTitle: "Topic A",
    }));

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_course_cards",
      arguments: { curriculumId: "cur_1", limit: 2, offset: 1 },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          cardId: "card_1",
          topicId: "top_1",
          topicTitle: "Topic A",
          concept: "Concept 1",
          prompt: "Prompt 1",
          answer: "Answer 1",
        },
        {
          cardId: "card_2",
          topicId: "top_1",
          topicTitle: "Topic A",
          concept: "Concept 2",
          prompt: "Prompt 2",
          answer: "Answer 2",
        },
      ],
      total: 5,
      limit: 2,
      offset: 1,
    });

    await client.close();
  });

  it("clamps a limit above 200 to 200, not rejecting or ignoring it, and truncates the actual page too", async () => {
    state.cardsForCurriculum = Array.from({ length: 201 }, (_, i) => ({
      variantId: `var_${i}`,
      cardId: `card_${i}`,
      concept: `Concept ${i}`,
      prompt: `Prompt ${i}`,
      answer: `Answer ${i}`,
      topicId: "top_1",
      topicTitle: "Topic A",
    }));

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_course_cards",
      arguments: { curriculumId: "cur_1", limit: 5000 },
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { limit: number; total: number; items: unknown[] };

    expect(structured.limit).toBe(200);
    expect(structured.total).toBe(201);
    expect(structured.items).toHaveLength(200);

    await client.close();
  });

  it("rejects an empty curriculumId at the input schema, before any database read", async () => {
    state.cardsForCurriculum = [
      {
        variantId: "var_1",
        cardId: "card_1",
        concept: "Concept",
        prompt: "Prompt",
        answer: "Answer",
        topicId: "top_1",
        topicTitle: "Topic A",
      },
    ];

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_course_cards",
      arguments: { curriculumId: "" },
    });

    expect(result.isError).toBe(true);

    await client.close();
  });

  it("returns a clean isError not-found result for an unknown curriculumId", async () => {
    state.curriculumExists = false;
    state.cardsForCurriculum = [
      {
        variantId: "var_1",
        cardId: "card_1",
        concept: "Concept",
        prompt: "Prompt",
        answer: "Answer",
        topicId: "top_1",
        topicTitle: "Topic A",
      },
    ];

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_course_cards",
      arguments: { curriculumId: "cur_missing" },
    });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).toContain("No course with id cur_missing");

    await client.close();
  });
});
