import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TopicCardSet } from "@post-anki/shared";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  cardSetByTopicId: new Map<string, TopicCardSet>(),
}));

vi.mock("../cards/cards.repo.js", () => ({
  getCardsByTopic: vi.fn(async (topicId: string) => state.cardSetByTopicId.get(topicId) ?? null),
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
  state.cardSetByTopicId = new Map();
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

describe("POST /mcp get_topic_cards", () => {
  it("returns a ready topic's cards with every prompt/answer variant through the real MCP client", async () => {
    state.cardSetByTopicId.set("top_1", {
      id: "cardset_1",
      topicId: "top_1",
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      cards: [
        {
          id: "card_1",
          cardSetId: "cardset_1",
          order: 1,
          concept: "Greetings",
          variants: [
            { id: "var_1", cardId: "card_1", order: 1, prompt: "Hello", answer: "Привет" },
          ],
        },
      ],
    });

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_topic_cards", arguments: { topicId: "top_1" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      topicId: "top_1",
      status: "ready",
      cards: [
        {
          id: "card_1",
          concept: "Greetings",
          variants: [{ prompt: "Hello", answer: "Привет" }],
        },
      ],
    });

    await client.close();
  });

  it("returns a generating status with an empty card list, even when stale cards remain from a prior ready set", async () => {
    state.cardSetByTopicId.set("top_1", {
      id: "cardset_1",
      topicId: "top_1",
      status: "generating",
      createdAt: "2026-01-01T00:00:00.000Z",
      cards: [
        {
          id: "card_1",
          cardSetId: "cardset_1",
          order: 1,
          concept: "Stale",
          variants: [{ id: "var_1", cardId: "card_1", order: 1, prompt: "Stale prompt", answer: "Stale answer" }],
        },
      ],
    });

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_topic_cards", arguments: { topicId: "top_1" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ topicId: "top_1", status: "generating", cards: [] });

    await client.close();
  });

  it("returns a clean isError not-found result for a topic with no card set", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_topic_cards", arguments: { topicId: "top_missing" } });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).toContain("top_missing");

    await client.close();
  });

  it("rejects an empty topicId at the input schema, before any database read", async () => {
    state.cardSetByTopicId.set("", {
      id: "cardset_1",
      topicId: "",
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      cards: [],
    });

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_topic_cards", arguments: { topicId: "" } });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).not.toContain("No card set for topic");

    await client.close();
  });
});
