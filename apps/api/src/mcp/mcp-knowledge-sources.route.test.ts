import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getKnowledgeBitForMcp,
  getKnowledgeSourceForMcp,
  listActiveVariantsForBits,
  listApprovedBitsForSourcePage,
  listKnowledgeSourcesPage,
  type McpBitRow,
  type McpSourceRow,
} from "../knowledge-source/knowledge-source-mcp.repo.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

vi.mock("../knowledge-source/knowledge-source-mcp.repo.js", () => ({
  listKnowledgeSourcesPage: vi.fn(),
  getKnowledgeSourceForMcp: vi.fn(),
  listApprovedBitsForSourcePage: vi.fn(),
  getKnowledgeBitForMcp: vi.fn(),
  listActiveVariantsForBits: vi.fn(),
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
  vi.resetAllMocks();
});

async function connectedClient(): Promise<InstanceType<typeof Client>> {
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${SHARED_SECRET}` } },
  });

  await client.connect(transport);

  return client;
}

function errorText(result: Record<string, unknown>): string {
  return (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
}

const source: McpSourceRow = {
  id: "src_1",
  kind: "prose",
  rawText: "Closures capture scope.",
  summary: null,
  sourceUrl: "https://example.com/a",
  subjectId: "sub_1",
  status: "detected",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const bit: McpBitRow = {
  id: "bit_1",
  knowledgeSourceId: "src_1",
  body: "A closure keeps its scope alive.",
  background: null,
  sourceLinks: null,
  topicId: null,
  approvalState: "approved",
};

describe("POST /mcp list_knowledge_sources", () => {
  it("lists sources with label, link, status and approved bit count through the real MCP client", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockResolvedValue({
      rows: [{ ...source, approvedBitCount: 2 }],
      total: 1,
    });

    const client = await connectedClient();
    const result = await client.callTool({ name: "list_knowledge_sources", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          id: "src_1",
          kind: "prose",
          label: "Closures capture scope.",
          sourceUrl: "https://example.com/a",
          subjectId: "sub_1",
          status: "detected",
          createdAt: "2026-01-01T00:00:00.000Z",
          approvedBitCount: 2,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    await client.close();
  });

  it("clamps a limit above 200 to 200 and forwards the subject filter", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockResolvedValue({ rows: [], total: 0 });

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_knowledge_sources",
      arguments: { subjectId: "sub_9", limit: 5000, offset: 2 },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ limit: 200, offset: 2 });
    expect(listKnowledgeSourcesPage).toHaveBeenCalledWith({ subjectId: "sub_9", limit: 200, offset: 2 });

    await client.close();
  });

  it("returns a generic failure message without leaking the driver error", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockRejectedValue(new Error("connection refused: secret detail"));

    const client = await connectedClient();
    const result = await client.callTool({ name: "list_knowledge_sources", arguments: {} });

    expect(result.isError).toBe(true);
    expect(errorText(result)).not.toContain("secret detail");

    await client.close();
  });
});

describe("POST /mcp get_source_knowledge_bits", () => {
  it("returns a source's approved bits with only their active questions", async () => {
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(source);
    vi.mocked(listApprovedBitsForSourcePage).mockResolvedValue({ rows: [bit], total: 1 });
    vi.mocked(listActiveVariantsForBits).mockResolvedValue([
      { knowledgeBitId: "bit_1", kind: "wh_question", prompt: "What?", answer: "That.", sentence: null },
    ]);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_source_knowledge_bits", arguments: { sourceId: "src_1" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          id: "bit_1",
          body: "A closure keeps its scope alive.",
          background: null,
          sourceLinks: [],
          topicId: null,
          questions: [{ kind: "wh_question", prompt: "What?", answer: "That.", sentence: null }],
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    await client.close();
  });

  it("returns a clean isError not-found result for an unknown source id", async () => {
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(null);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_source_knowledge_bits", arguments: { sourceId: "src_missing" } });

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain("No knowledge source with id src_missing");

    await client.close();
  });
});

describe("POST /mcp get_knowledge_bit", () => {
  it("opens a bit found by search with its source, approval state and questions", async () => {
    vi.mocked(getKnowledgeBitForMcp).mockResolvedValue({ ...bit, approvalState: "pending" });
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(source);
    vi.mocked(listActiveVariantsForBits).mockResolvedValue([
      { knowledgeBitId: "bit_1", kind: "basic", prompt: "Q", answer: "A", sentence: null },
    ]);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_knowledge_bit", arguments: { id: "bit_1" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      id: "bit_1",
      approvalState: "pending",
      source: { id: "src_1", label: "Closures capture scope.", sourceUrl: "https://example.com/a" },
      questions: [{ kind: "basic", prompt: "Q", answer: "A", sentence: null }],
    });

    await client.close();
  });

  it("returns a clean isError not-found result for an unknown bit id", async () => {
    vi.mocked(getKnowledgeBitForMcp).mockResolvedValue(null);

    const client = await connectedClient();
    const result = await client.callTool({ name: "get_knowledge_bit", arguments: { id: "bit_missing" } });

    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain("No knowledge bit with id bit_missing");

    await client.close();
  });
});
