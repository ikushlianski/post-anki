import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// The subject dimension on tracked_tool_scan_state (wishlist: "Give
// tracked_tool_scan_state a subject dimension"). The watermark used to be
// keyed by tool_key alone, so the FIRST gated subject a scheduled run
// processed advanced every tool's hash and every LATER subject in the same
// run saw "nothing changed" — no agent call, no suggestions, forever.
// Invisible with one gated subject; a silent correctness bug with two.
//
// Both subjects here are given the SAME tree shape on purpose, so the one
// stubbed agent payload resolves fully against either subject's own flat
// node list — otherwise a dropped supersession would make this pass for the
// wrong reason.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

assertLocalDbTarget(BASE_DATABASE_URL);

const mockAgentGenerate = vi.fn();
const mockFetchTrackedTool = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { docScan: "docScan" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("./tracked-tool-fetcher.js", () => ({
  fetchTrackedTool: mockFetchTrackedTool,
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const dbName = `doc_scan_subject_watermark_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: testDatabaseUrl });
  const migrateDb = drizzle(migratePool);

  await migrate(migrateDb, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.OPENROUTER_API_KEY = "e2e-dummy-key";
}, 60_000);

afterAll(async () => {
  const { closeDb } = await import("../db/client.js");
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

const TOOL_KEYS = ["nextjs", "typescript", "react-router", "tc39-proposals"];

function mockAllToolsFetch(generation: number): void {
  mockFetchTrackedTool.mockImplementation(async (tool: { toolKey: string }) => {
    const content = `${tool.toolKey} release content — generation ${generation}`;
    const { createHash } = await import("node:crypto");

    return { content, hash: createHash("sha256").update(content).digest("hex") };
  });
}

async function seedGatedSubject(label: string): Promise<string> {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const frontendId = newId("dnode");
  const nextJsId = newId("dnode");

  await db.insert(subjects).values({ id: subjectId, name: `${label} ${subjectId}` });
  await db.insert(domainNodes).values([
    { id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0 },
    { id: nextJsId, subjectId, parentId: frontendId, name: "Next.js", order: 0 },
  ]);

  return subjectId;
}

function stubbedAgentPayload() {
  return {
    object: {
      newTopicSuggestions: [
        {
          parentNodePath: ["root", "Frontend"],
          nodeName: "Astro",
          reason: "Stubbed — Astro appeared in the tracked changelog content.",
        },
      ],
      supersessionSuggestions: [
        {
          nodePath: ["root", "Frontend", "Next.js"],
          reason: "Stubbed — newer material supersedes this node.",
        },
      ],
    },
  };
}

describe("runDocScanForAllTrackedSubjects — two gated subjects in one scheduled run", () => {
  it("gives every gated subject its own suggestions and its own per-tool watermark", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(1);
    mockAgentGenerate.mockResolvedValue(stubbedAgentPayload());

    const firstSubjectId = await seedGatedSubject("Programming / Web Development");
    const secondSubjectId = await seedGatedSubject("Data Engineering");

    const { runDocScanForAllTrackedSubjects } = await import("./doc-scan.orchestrator.js");

    const results = await runDocScanForAllTrackedSubjects();

    expect(mockAgentGenerate).toHaveBeenCalledTimes(2);
    expect(Object.keys(results).sort()).toEqual([firstSubjectId, secondSubjectId].sort());

    const { getDb } = await import("../db/client.js");
    const { trackedToolScanState, domainTopicSuggestions, domainSupersessionSuggestions } =
      await import("../db/schema.js");
    const db = getDb();

    for (const subjectId of [firstSubjectId, secondSubjectId]) {
      expect(results[subjectId]?.agentCalled).toBe(true);
      expect(results[subjectId]?.toolsChanged.sort()).toEqual([...TOOL_KEYS].sort());

      const topicRows = await db
        .select()
        .from(domainTopicSuggestions)
        .where(eq(domainTopicSuggestions.subjectId, subjectId));
      expect(topicRows).toHaveLength(1);
      expect(topicRows[0]?.proposedNodeName).toBe("Astro");

      const supersessionRows = await db
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.subjectId, subjectId));
      expect(supersessionRows).toHaveLength(1);

      const watermarkRows = await db
        .select()
        .from(trackedToolScanState)
        .where(eq(trackedToolScanState.subjectId, subjectId));
      expect(watermarkRows.map((row) => row.toolKey).sort()).toEqual([...TOOL_KEYS].sort());
    }
  }, 60_000);

  it("makes zero agent calls on an unchanged second run for either subject", async () => {
    mockAgentGenerate.mockClear();
    mockAllToolsFetch(1);

    const { runDocScanForAllTrackedSubjects } = await import("./doc-scan.orchestrator.js");

    await runDocScanForAllTrackedSubjects();

    expect(mockAgentGenerate).not.toHaveBeenCalled();
  }, 60_000);
});
