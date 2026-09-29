import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  curriculumRows: [] as unknown[],
  sourceRows: [] as unknown[],
  domainMappingRows: [] as unknown[],
  subjectRows: [] as unknown[],
  moduleRows: [] as unknown[],
  topicRows: [] as unknown[],
  cardSetRows: [] as unknown[],
}));

vi.mock("../db/client.js", async () => {
  const schema = await import("../db/schema.js");
  let currentTable: unknown;

  const rowsGetterByTable = new Map<unknown, () => unknown[]>([
    [schema.curricula, () => state.curriculumRows],
    [schema.sources, () => state.sourceRows],
    [schema.curriculumDomainNodeMappings, () => state.domainMappingRows],
    [schema.subjects, () => state.subjectRows],
    [schema.modules, () => state.moduleRows],
    [schema.topics, () => state.topicRows],
    [schema.topicCardSets, () => state.cardSetRows],
  ]);

  function rowsForCurrentTable(): unknown[] {
    return (rowsGetterByTable.get(currentTable) ?? (() => []))();
  }

  const chain = {
    select: () => chain,
    from: (table: unknown) => {
      currentTable = table;

      return chain;
    },
    where: () => {
      const rows = [...rowsForCurrentTable()];

      return Object.assign(rows, {
        orderBy: () => [...rowsForCurrentTable()],
      });
    },
    orderBy: () => [...rowsForCurrentTable()],
  };

  return { getDb: () => chain };
});

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
  state.curriculumRows = [];
  state.sourceRows = [];
  state.domainMappingRows = [];
  state.subjectRows = [];
  state.moduleRows = [];
  state.topicRows = [];
  state.cardSetRows = [];
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

describe("POST /mcp list_courses", () => {
  it("returns courses with subject names through the real MCP client", async () => {
    state.curriculumRows = [
      { id: "cur_1", subjectId: "sub_1", name: "Spanish 101", order: 0 },
    ];
    state.subjectRows = [{ id: "sub_1", name: "Spanish" }];

    const client = await connectedClient();
    const result = await client.callTool({ name: "list_courses", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [{ id: "cur_1", name: "Spanish 101", subjectId: "sub_1", subjectName: "Spanish" }],
      total: 1,
      limit: 50,
      offset: 0,
    });

    await client.close();
  });
});

describe("POST /mcp get_course_structure", () => {
  it("returns modules and topics in order through the real MCP client", async () => {
    state.curriculumRows = [{ id: "cur_1", subjectId: "sub_1", name: "Spanish 101", order: 0 }];
    state.moduleRows = [{ id: "mod_1", curriculumId: "cur_1", title: "Module A", order: 0 }];
    state.topicRows = [{ id: "top_1", moduleId: "mod_1", title: "Topic A1", order: 0 }];
    state.cardSetRows = [{ topicId: "top_1", status: "ready" }];

    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_course_structure",
      arguments: { curriculumId: "cur_1" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      curriculum: { id: "cur_1", name: "Spanish 101", subjectId: "sub_1" },
      modules: [
        {
          id: "mod_1",
          title: "Module A",
          order: 0,
          topics: [{ id: "top_1", title: "Topic A1", order: 0, cardSetStatus: "ready" }],
        },
      ],
    });

    await client.close();
  });

  it("returns a clean isError not-found result for an unknown curriculum id, through the real MCP client", async () => {
    state.curriculumRows = [];

    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_course_structure",
      arguments: { curriculumId: "cur_missing" },
    });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).toContain("cur_missing");

    await client.close();
  });

  it("rejects an empty curriculumId at the input schema, before any database read", async () => {
    // Would succeed if the call reached the DB — isolates zod rejection from not-found.
    state.curriculumRows = [{ id: "cur_1", subjectId: "sub_1", name: "Spanish 101", order: 0 }];

    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_course_structure",
      arguments: { curriculumId: "" },
    });

    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";

    expect(text).not.toContain("No course with id");

    await client.close();
  });
});
