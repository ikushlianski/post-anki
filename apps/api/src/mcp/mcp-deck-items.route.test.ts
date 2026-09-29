import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Subject } from "@post-anki/shared";
import { listPhrasesForSubject, type PhraseSelectRow } from "../practice/practice.repo.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  subjectById: new Map<string, Subject>(),
  phrasesBySubjectId: new Map<string, PhraseSelectRow[]>(),
}));

vi.mock("../subject/subject.repo.js", () => ({
  getSubject: vi.fn(async (subjectId: string) => state.subjectById.get(subjectId) ?? null),
}));

vi.mock("../practice/practice.repo.js", () => ({
  listPhrasesForSubject: vi.fn(
    async (subjectId: string) => state.phrasesBySubjectId.get(subjectId) ?? [],
  ),
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
  state.subjectById = new Map();
  state.phrasesBySubjectId = new Map();
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

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "sub_1",
    name: "Spanish",
    description: undefined,
    requireSources: false,
    kind: "language-practice",
    modelTier: null,
    ...overrides,
  };
}

function makePhraseRow(overrides: Partial<PhraseSelectRow> = {}): PhraseSelectRow {
  return {
    id: "phrase_1",
    subjectId: "sub_1",
    batchId: "batch_1",
    level: "B1_B2",
    pack: "General",
    position: 1,
    russian: "привет",
    referenceEnglish: "hello",
    domain: "greetings",
    targetPhraseBankEntryId: null,
    sequenceNumber: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("POST /mcp get_deck_items", () => {
  it("returns a deck's phrase items through the real MCP client", async () => {
    state.subjectById.set("sub_1", makeSubject({ id: "sub_1" }));
    state.phrasesBySubjectId.set("sub_1", [
      makePhraseRow({ id: "phrase_1", sequenceNumber: 1 }),
      makePhraseRow({ id: "phrase_2", sequenceNumber: 2, russian: "спасибо", referenceEnglish: "thanks" }),
    ]);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_deck_items", arguments: { subjectId: "sub_1" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          id: "phrase_1",
          russian: "привет",
          referenceEnglish: "hello",
          domain: "greetings",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "phrase_2",
          russian: "спасибо",
          referenceEnglish: "thanks",
          domain: "greetings",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });

    await client.close();
  });

  it("returns an isError \"not a deck\" result for a course subject, without listing phrases", async () => {
    state.subjectById.set("sub_course", makeSubject({ id: "sub_course", kind: "architecture-mentor" }));
    state.phrasesBySubjectId.set("sub_course", [makePhraseRow({ subjectId: "sub_course" })]);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_deck_items", arguments: { subjectId: "sub_course" } });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).toContain("not a deck");
    expect(vi.mocked(listPhrasesForSubject)).not.toHaveBeenCalled();

    await client.close();
  });

  it("returns a clean isError not-found result for an unknown subject id", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_deck_items", arguments: { subjectId: "sub_missing" } });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).toContain("No subject with id sub_missing");
    expect(text).not.toContain("not a deck");

    await client.close();
  });

  it("rejects an empty subjectId at the input schema, before any database read", async () => {
    state.subjectById.set("", makeSubject({ id: "" }));
    state.phrasesBySubjectId.set("", [makePhraseRow({ subjectId: "" })]);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_deck_items", arguments: { subjectId: "" } });

    expect(result.isError).toBe(true);

    await client.close();
  });

  it("clamps a limit above 200 to 200, not rejecting or ignoring it, and truncates the actual page too", async () => {
    state.subjectById.set("sub_1", makeSubject({ id: "sub_1" }));
    state.phrasesBySubjectId.set(
      "sub_1",
      Array.from({ length: 201 }, (_, i) => makePhraseRow({ id: `phrase_${i}`, sequenceNumber: i })),
    );

    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_deck_items",
      arguments: { subjectId: "sub_1", limit: 5000 },
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { limit: number; total: number; items: unknown[] };

    expect(structured.limit).toBe(200);
    expect(structured.total).toBe(201);
    expect(structured.items).toHaveLength(200);

    await client.close();
  });
});
