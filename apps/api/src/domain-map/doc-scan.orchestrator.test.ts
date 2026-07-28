import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

function fakeRequest(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeResponse(): http.ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 0,
    body: "",
    writeHead(status: number) {
      res.statusCode = status;
    },
    end(chunk?: string) {
      res.body = chunk ?? "";
    },
  } as unknown as http.ServerResponse & { statusCode: number; body: string };

  return res;
}

// SCENARIOS 2, 3, 4, 10 (.planning/doc-changelog-scan/scenarios.md).
//
// S2: first-ever scan (no tracked_tool_scan_state rows) treats every tool as
// changed — exactly one agent call receiving all 4 tools' content, a
// watermark row inserted per tool, resolved suggestions inserted.
//
// S3 (the load-bearing "never a firehose" proof): a second run against
// byte-identical mocked fetch content makes ZERO agent calls (call-count
// assertion on the mocked agent, not the orchestrator's own self-reported
// agentCalled flag) and zero new suggestion rows.
//
// S4: only the 1-of-4 changed tool's content reaches the agent's prompt —
// asserted on the mock's captured call argument.
//
// S10 (anti-data-loss): a rejected agent call with 2 changed tools leaves
// those 2 tools' tracked_tool_scan_state.last_content_hash UNCHANGED from
// their pre-call value (captured before the call, compared with toBe — not
// merely "not the new hash").
//
// Real Postgres (not a mocked repo), same reasoning as
// domain-priority-review.orchestrator.test.ts: spec.md's DoD requires real
// SELECTs against 3 new tables, which only a real connection can produce.
// Only fetchTrackedTool (network) and the mastra agent call are mocked.
// Kept at this exact path (not *.integration.test.ts) — vitest.config.ts's
// exclude list carries this exact filename as a named exception, same
// precedent as domain-priority-review.orchestrator.test.ts.
//
// RED right now: apps/api/src/domain-map/doc-scan.orchestrator.ts,
// tracked-tool-fetcher.ts, domain_topic_suggestions/
// domain_supersession_suggestions/tracked_tool_scan_state do not exist yet.

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

const dbName = `doc_scan_orchestrator_${randomUUID().replace(/-/g, "_")}`;
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

function contentFor(toolKey: string, generation: number): string {
  return `${toolKey} release content — generation ${generation}`;
}

function mockAllToolsFetch(generation: number): void {
  mockFetchTrackedTool.mockImplementation(async (tool: { toolKey: string }) => {
    const content = contentFor(tool.toolKey, generation);
    const { createHash } = await import("node:crypto");

    return { content, hash: createHash("sha256").update(content).digest("hex") };
  });
}

async function seedTree(): Promise<{ subjectId: string; frontendId: string; nextJsId: string }> {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const frontendId = newId("dnode");
  const nextJsId = newId("dnode");

  await db.insert(subjects).values({ id: subjectId, name: `E2E DocScan Subject ${subjectId}` });
  await db.insert(domainNodes).values([
    { id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0 },
    { id: nextJsId, subjectId, parentId: frontendId, name: "Next.js", order: 0 },
  ]);

  return { subjectId, frontendId, nextJsId };
}

function mockAgentPayload(nextJsId: string, frontendId: string) {
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
          reason: "Stubbed — Next.js release content suggests newer material supersedes this.",
        },
      ],
    },
  };
}

describe("runDocScan — SCENARIO 2 (first-ever scan, exactly one agent call, watermark rows inserted)", () => {
  it("calls the agent exactly once with all 4 tools' content and inserts a watermark row per tool", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(1);

    const { subjectId, frontendId, nextJsId } = await seedTree();
    mockAgentGenerate.mockResolvedValue(mockAgentPayload(nextJsId, frontendId));

    const { runDocScan } = await import("./doc-scan.orchestrator.js");

    const result = await runDocScan(subjectId);

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect(result.agentCalled).toBe(true);
    expect(result.toolsChanged.sort()).toEqual([...TOOL_KEYS].sort());

    const { getDb } = await import("../db/client.js");
    const { trackedToolScanState, domainTopicSuggestions, domainSupersessionSuggestions } =
      await import("../db/schema.js");
    const db = getDb();

    const watermarkRows = await db.select().from(trackedToolScanState);
    expect(watermarkRows).toHaveLength(4);

    for (const row of watermarkRows) {
      expect(row.lastContentHash).not.toBeNull();
    }

    const topicRows = await db
      .select()
      .from(domainTopicSuggestions)
      .where(eq(domainTopicSuggestions.subjectId, subjectId));
    expect(topicRows).toHaveLength(1);
    expect(topicRows[0]?.source).toBe("doc-scan");
    expect(topicRows[0]?.status).toBe("pending");
    expect(topicRows[0]?.proposedParentNodeId).toBe(frontendId);

    const supersessionRows = await db
      .select()
      .from(domainSupersessionSuggestions)
      .where(eq(domainSupersessionSuggestions.subjectId, subjectId));
    expect(supersessionRows).toHaveLength(1);
    expect(supersessionRows[0]?.source).toBe("doc-scan");
    expect(supersessionRows[0]?.status).toBe("pending");
    expect(supersessionRows[0]?.domainNodeId).toBe(nextJsId);
  });
});

describe("runDocScan — SCENARIO 3 (second run against unchanged content: zero agent calls, zero new rows — the 'never a firehose' proof)", () => {
  it("makes zero agent calls and inserts zero new rows when nothing changed since the first run", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(2);

    const { subjectId, frontendId, nextJsId } = await seedTree();
    mockAgentGenerate.mockResolvedValue(mockAgentPayload(nextJsId, frontendId));

    const { runDocScan } = await import("./doc-scan.orchestrator.js");

    const first = await runDocScan(subjectId);
    expect(first.agentCalled).toBe(true);
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);

    const { getDb } = await import("../db/client.js");
    const { domainTopicSuggestions, domainSupersessionSuggestions } = await import(
      "../db/schema.js"
    );
    const db = getDb();

    const topicCountBefore = (
      await db
        .select()
        .from(domainTopicSuggestions)
        .where(eq(domainTopicSuggestions.subjectId, subjectId))
    ).length;
    const supersessionCountBefore = (
      await db
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.subjectId, subjectId))
    ).length;

    // Second run: identical mocked fetch content (same generation — same
    // hash) — nothing changed.
    mockAgentGenerate.mockClear();

    const second = await runDocScan(subjectId);

    // The call-count assertion is on the mocked agent itself, captured
    // across ONLY the second run (mockClear() above reset the counter) —
    // not on the orchestrator's own self-reported agentCalled flag.
    expect(mockAgentGenerate).toHaveBeenCalledTimes(0);
    expect(second.agentCalled).toBe(false);
    expect(second.toolsChanged).toEqual([]);

    const topicCountAfter = (
      await db
        .select()
        .from(domainTopicSuggestions)
        .where(eq(domainTopicSuggestions.subjectId, subjectId))
    ).length;
    const supersessionCountAfter = (
      await db
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.subjectId, subjectId))
    ).length;

    expect(topicCountAfter).toBe(topicCountBefore);
    expect(supersessionCountAfter).toBe(supersessionCountBefore);
  });
});

describe("runDocScan — SCENARIO 4 (only changed tools are included in the agent prompt)", () => {
  it("calls the agent exactly once with only the one changed tool's content, excluding the other 3", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(3);

    const { subjectId, frontendId, nextJsId } = await seedTree();
    mockAgentGenerate.mockResolvedValue(mockAgentPayload(nextJsId, frontendId));

    const { runDocScan } = await import("./doc-scan.orchestrator.js");

    await runDocScan(subjectId);

    // Second run: only "typescript" changes.
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockImplementation(async (tool: { toolKey: string }) => {
      const generation = tool.toolKey === "typescript" ? 4 : 3;
      const content = contentFor(tool.toolKey, generation);
      const { createHash } = await import("node:crypto");

      return { content, hash: createHash("sha256").update(content).digest("hex") };
    });

    const result = await runDocScan(subjectId);

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect(result.toolsChanged).toEqual(["typescript"]);

    const promptArg = mockAgentGenerate.mock.calls[0]?.[0] as string;
    expect(promptArg).toContain(contentFor("typescript", 4));
    expect(promptArg).not.toContain(contentFor("nextjs", 3));
    expect(promptArg).not.toContain(contentFor("react-router", 3));
    expect(promptArg).not.toContain(contentFor("tc39-proposals", 3));
  });
});

describe("runDocScan — SCENARIO 10 (agent failure mid-scan leaves changed tools' watermark un-advanced — anti-data-loss)", () => {
  it("does not throw, inserts zero new rows, and leaves the 2 changed tools' watermark hash unchanged from before the failed call", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(5);

    const { subjectId } = await seedTree();
    mockAgentGenerate.mockResolvedValue({ object: { newTopicSuggestions: [], supersessionSuggestions: [] } });

    const { runDocScan } = await import("./doc-scan.orchestrator.js");

    // Establish a baseline watermark for all 4 tools.
    await runDocScan(subjectId);

    const { getDb } = await import("../db/client.js");
    const { trackedToolScanState, domainTopicSuggestions, domainSupersessionSuggestions } =
      await import("../db/schema.js");
    const db = getDb();

    const oldHashes = new Map<string, string | null>();
    for (const row of await db.select().from(trackedToolScanState)) {
      oldHashes.set(row.toolKey, row.lastContentHash);
    }

    // Next run: "nextjs" and "typescript" change; the agent call rejects.
    mockFetchTrackedTool.mockImplementation(async (tool: { toolKey: string }) => {
      const generation = tool.toolKey === "nextjs" || tool.toolKey === "typescript" ? 6 : 5;
      const content = contentFor(tool.toolKey, generation);
      const { createHash } = await import("node:crypto");

      return { content, hash: createHash("sha256").update(content).digest("hex") };
    });
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const topicCountBefore = (
      await db
        .select()
        .from(domainTopicSuggestions)
        .where(eq(domainTopicSuggestions.subjectId, subjectId))
    ).length;
    const supersessionCountBefore = (
      await db
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.subjectId, subjectId))
    ).length;

    const result = await runDocScan(subjectId);

    expect(result.agentCalled).toBe(false);
    expect(result.agentError).toBe(true);
    expect(result.toolsChanged.sort()).toEqual(["nextjs", "typescript"].sort());
    expect(result.newTopicSuggestions).toEqual([]);
    expect(result.supersessionSuggestions).toEqual([]);

    const topicCountAfter = (
      await db
        .select()
        .from(domainTopicSuggestions)
        .where(eq(domainTopicSuggestions.subjectId, subjectId))
    ).length;
    const supersessionCountAfter = (
      await db
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.subjectId, subjectId))
    ).length;

    expect(topicCountAfter).toBe(topicCountBefore);
    expect(supersessionCountAfter).toBe(supersessionCountBefore);

    const newHashes = new Map<string, string | null>();
    for (const row of await db.select().from(trackedToolScanState)) {
      newHashes.set(row.toolKey, row.lastContentHash);
    }

    // The negative assertion that matters: the 2 changed tools' hash is
    // still exactly their OLD (pre-failure) hash, not the new,
    // never-processed content's hash and not null/deleted.
    expect(newHashes.get("nextjs")).toBe(oldHashes.get("nextjs"));
    expect(newHashes.get("typescript")).toBe(oldHashes.get("typescript"));

    const { log } = await import("../shared/log.js");
    expect(vi.mocked(log.error)).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId }),
      "doc_scan_agent_failed",
    );
  });

  it("SCENARIO 10's Integration line: POST /subjects/:id/doc-scans still responds 200, never 502, on an agent-call failure (Cloud-Scheduler-retry-storm avoidance) — run through the actual controller, not just the bare orchestrator function", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(9);

    const { subjectId } = await seedTree();
    mockAgentGenerate.mockResolvedValue({ object: { newTopicSuggestions: [], supersessionSuggestions: [] } });

    const { handleTriggerDocScan } = await import("./domain-map.controller.js");

    // Baseline scan (succeeds) so the second run has changed content to
    // hand to a now-rejecting agent.
    await handleTriggerDocScan(fakeResponse(), subjectId);

    mockFetchTrackedTool.mockImplementation(async (tool: { toolKey: string }) => {
      const content = contentFor(tool.toolKey, 10);
      const { createHash } = await import("node:crypto");

      return { content, hash: createHash("sha256").update(content).digest("hex") };
    });
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = fakeResponse();
    await handleTriggerDocScan(res, subjectId);

    expect(res.statusCode).toBe(200);
  });
});

describe("handleTriggerAllDocScans — the scheduled job's actual entry point (POST /doc-scans)", () => {
  it("dispatches runDocScan once per gated subject and returns 200 with a result keyed by subject id — and demonstrates the known cross-subject watermark limitation", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(11);
    mockAgentGenerate.mockResolvedValue({ object: { newTopicSuggestions: [], supersessionSuggestions: [] } });

    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, trackedToolScanState } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    // Cleared so this test's own invariant (exactly one gated subject in
    // the WHOLE database gets a real agent call, no matter how many others
    // exist from earlier tests in this file) is deterministic rather than
    // depending on whatever hash a prior test happened to leave behind.
    await db.delete(trackedToolScanState);

    const subjectA = newId("sub");
    const subjectB = newId("sub");

    await db.insert(subjects).values([
      { id: subjectA, name: `E2E All-Subjects A ${subjectA}` },
      { id: subjectB, name: `E2E All-Subjects B ${subjectB}` },
    ]);
    await db.insert(domainNodes).values([
      { id: newId("dnode"), subjectId: subjectA, parentId: null, name: "Frontend", order: 0 },
      { id: newId("dnode"), subjectId: subjectB, parentId: null, name: "Frontend", order: 0 },
    ]);

    const { handleTriggerAllDocScans } = await import("./domain-map.controller.js");

    const res = fakeResponse();
    await handleTriggerAllDocScans(res);

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body) as Record<string, { agentCalled: boolean }>;
    expect(Object.keys(body)).toEqual(expect.arrayContaining([subjectA, subjectB]));

    // Known limitation (documented in docs/architecture/doc-changelog-scan.md
    // and .planning/doc-changelog-scan/todo.md, not fixed here — a real
    // architectural decision, not a bug to silently patch): tracked_tool_
    // scan_state is keyed by tool_key ALONE, with no subject dimension.
    // listSubjectIdsWithDomainNodes() returns EVERY gated subject in the
    // whole database (every earlier test in this file left its own gated
    // subject behind), so this single dispatch call fans out across all of
    // them, not just subjectA/subjectB. Whichever ONE of them is processed
    // first genuinely sees "changed" content and calls the agent, advancing
    // the GLOBAL watermark for all 4 tools; every subject processed after
    // that — despite never having been scanned before, itself — sees the
    // same mocked content as already "unchanged" and gets zero suggestions.
    // This is the exact "before seeding a second gated subject" trap noted
    // in todo.md, demonstrated here as an order-independent invariant
    // (exactly one true, the rest false) rather than asserting which
    // specific subject wins — that part IS legitimately order-dependent.
    const agentCalledCount = Object.values(body).filter((r) => r.agentCalled).length;
    expect(agentCalledCount).toBe(1);
  });
});

// Backend DoD proofs with no dedicated SCENARIO number in scenarios.md
// (spec.md's "Definition of Done — per layer / Backend" lists these
// separately from SCENARIOS 1-4/10) — homed here since this file is already
// DB-backed and already the named vitest.config.ts exclude-list exception.

describe("runDocScan — cap proof (MAX_TOTAL_SUGGESTIONS)", () => {
  it("inserts exactly 5 total rows across both suggestion tables when the agent returns the schema max (3 + 3 = 6, all resolving to real nodes)", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(7);

    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    const subjectId = newId("sub");
    const frontendId = newId("dnode");
    const nodeIds = Array.from({ length: 5 }, () => newId("dnode"));

    await db.insert(subjects).values({ id: subjectId, name: `E2E DocScan Cap Subject ${subjectId}` });
    await db.insert(domainNodes).values([
      { id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0 },
      ...nodeIds.map((id, index) => ({
        id,
        subjectId,
        parentId: frontendId,
        name: `CapNode${index}`,
        order: index,
      })),
    ]);

    mockAgentGenerate.mockResolvedValue({
      object: {
        newTopicSuggestions: [
          { parentNodePath: ["root", "Frontend"], nodeName: "New1", reason: "r1" },
          { parentNodePath: ["root", "Frontend"], nodeName: "New2", reason: "r2" },
          { parentNodePath: ["root", "Frontend"], nodeName: "New3", reason: "r3" },
        ],
        supersessionSuggestions: [
          { nodePath: ["root", "Frontend", "CapNode0"], reason: "s1" },
          { nodePath: ["root", "Frontend", "CapNode1"], reason: "s2" },
          { nodePath: ["root", "Frontend", "CapNode2"], reason: "s3" },
        ],
      },
    });

    const { runDocScan } = await import("./doc-scan.orchestrator.js");
    const result = await runDocScan(subjectId);

    expect(result.newTopicSuggestions).toHaveLength(3);
    expect(result.supersessionSuggestions).toHaveLength(2);

    const { domainTopicSuggestions, domainSupersessionSuggestions } = await import(
      "../db/schema.js"
    );

    const topicRows = await db
      .select()
      .from(domainTopicSuggestions)
      .where(eq(domainTopicSuggestions.subjectId, subjectId));
    const supersessionRows = await db
      .select()
      .from(domainSupersessionSuggestions)
      .where(eq(domainSupersessionSuggestions.subjectId, subjectId));

    // spec.md's step 5b pins the ORDER, not just the total: new-topic
    // suggestions are taken first (all 3 fit), then supersession fills the
    // remaining cap (2 of its 3) — asserting the exact split, not just that
    // the two counts sum to 5, which an implementation that dropped all 3
    // topics and kept 2 supersessions would also satisfy.
    expect(topicRows).toHaveLength(3);
    expect(supersessionRows).toHaveLength(2);
  });
});

describe("POST /subjects/:id/doc-scans — endpoint-level proof (exactly 1 new-topic + 1 supersession row)", () => {
  it("handleTriggerDocScan inserts exactly 1 domain_topic_suggestions row and exactly 1 domain_supersession_suggestions row, both source: doc-scan, status: pending", async () => {
    mockAgentGenerate.mockClear();
    mockFetchTrackedTool.mockClear();
    mockAllToolsFetch(8);

    const { subjectId, frontendId, nextJsId } = await seedTree();
    mockAgentGenerate.mockResolvedValue(mockAgentPayload(nextJsId, frontendId));

    const { handleTriggerDocScan } = await import("./domain-map.controller.js");

    const req = fakeRequest({});
    const res = fakeResponse();

    await handleTriggerDocScan(res, subjectId);

    expect(res.statusCode).toBe(200);

    const { getDb } = await import("../db/client.js");
    const { domainTopicSuggestions, domainSupersessionSuggestions } = await import(
      "../db/schema.js"
    );
    const db = getDb();

    const topicRows = await db
      .select()
      .from(domainTopicSuggestions)
      .where(eq(domainTopicSuggestions.subjectId, subjectId));
    const supersessionRows = await db
      .select()
      .from(domainSupersessionSuggestions)
      .where(eq(domainSupersessionSuggestions.subjectId, subjectId));

    expect(topicRows).toHaveLength(1);
    expect(topicRows[0]?.source).toBe("doc-scan");
    expect(topicRows[0]?.status).toBe("pending");

    expect(supersessionRows).toHaveLength(1);
    expect(supersessionRows[0]?.source).toBe("doc-scan");
    expect(supersessionRows[0]?.status).toBe("pending");
  });
});

describe("PATCH /domain-topic-suggestions/:id — accept/reject proofs", () => {
  it("accepting inserts a new domain_nodes row and sets created_domain_node_id + resolved_at", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, domainTopicSuggestions } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    const subjectId = newId("sub");
    const frontendId = newId("dnode");

    await db.insert(subjects).values({ id: subjectId, name: `E2E Topic Accept ${subjectId}` });
    await db.insert(domainNodes).values({ id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0 });

    const suggestionId = newId("dtsug");
    await db.insert(domainTopicSuggestions).values({
      id: suggestionId,
      subjectId,
      proposedParentNodeId: frontendId,
      proposedNodeName: "Astro",
      reason: "stub reason",
      source: "doc-scan",
      status: "pending",
    });

    const { handleResolveDomainTopicSuggestion } = await import("./domain-map.controller.js");

    const req = fakeRequest({ status: "accepted" });
    const res = fakeResponse();

    await handleResolveDomainTopicSuggestion(req, res, suggestionId);

    expect(res.statusCode).toBe(200);

    const updated = (
      await db.select().from(domainTopicSuggestions).where(eq(domainTopicSuggestions.id, suggestionId))
    )[0];
    expect(updated?.status).toBe("accepted");
    expect(updated?.resolvedAt).not.toBeNull();
    expect(updated?.createdDomainNodeId).not.toBeNull();

    const created = await db
      .select()
      .from(domainNodes)
      .where(eq(domainNodes.id, updated!.createdDomainNodeId!));
    expect(created).toHaveLength(1);
    expect(created[0]?.parentId).toBe(frontendId);
    expect(created[0]?.name).toBe("Astro");
  });

  it("rejecting sets resolved_at only — no new domain_nodes row created", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, domainTopicSuggestions } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    const subjectId = newId("sub");
    const frontendId = newId("dnode");

    await db.insert(subjects).values({ id: subjectId, name: `E2E Topic Reject ${subjectId}` });
    await db.insert(domainNodes).values({ id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0 });

    const nodeCountBefore = (
      await db.select().from(domainNodes).where(eq(domainNodes.subjectId, subjectId))
    ).length;

    const suggestionId = newId("dtsug");
    await db.insert(domainTopicSuggestions).values({
      id: suggestionId,
      subjectId,
      proposedParentNodeId: frontendId,
      proposedNodeName: "Astro",
      reason: "stub reason",
      source: "doc-scan",
      status: "pending",
    });

    const { handleResolveDomainTopicSuggestion } = await import("./domain-map.controller.js");

    const req = fakeRequest({ status: "rejected" });
    const res = fakeResponse();

    await handleResolveDomainTopicSuggestion(req, res, suggestionId);

    expect(res.statusCode).toBe(200);

    const updated = (
      await db.select().from(domainTopicSuggestions).where(eq(domainTopicSuggestions.id, suggestionId))
    )[0];
    expect(updated?.status).toBe("rejected");
    expect(updated?.resolvedAt).not.toBeNull();
    expect(updated?.createdDomainNodeId).toBeNull();

    const nodeCountAfter = (
      await db.select().from(domainNodes).where(eq(domainNodes.subjectId, subjectId))
    ).length;
    expect(nodeCountAfter).toBe(nodeCountBefore);
  });
});

describe("PATCH /domain-supersession-suggestions/:id — accept/reject proofs, including the percent-byte-identical negative assertion (Decisions #2)", () => {
  it("accepting sets superseded_at/superseded_reason AND leaves the flagged node's percent byte-identical before/after (proves 'flag, never reduce percent')", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, curricula, modules, topics, domainSupersessionSuggestions } =
      await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    const subjectId = newId("sub");
    const nextJsId = newId("dnode");
    const curriculumId = newId("curr");
    const moduleId = newId("mod");

    await db.insert(subjects).values({ id: subjectId, name: `E2E Supersession Accept ${subjectId}` });
    await db.insert(domainNodes).values({ id: nextJsId, subjectId, parentId: null, name: "Next.js", order: 0 });
    await db.insert(curricula).values({
      id: curriculumId,
      subjectId,
      name: "Studied Next.js curriculum",
      status: "ready",
      domainNodeId: nextJsId,
    });
    await db.insert(modules).values({ id: moduleId, curriculumId, title: "Module", order: 0 });
    await db.insert(topics).values({
      id: newId("topic"),
      moduleId,
      curriculumId,
      title: "Topic A",
      order: 0,
      included: true,
      progressStatus: "mastered",
      progressMaturity: 80,
    });

    const { getDomainMapForSubject } = await import("./domain-map.repo.js");

    const treeBefore = await getDomainMapForSubject(subjectId);
    const percentBefore = treeBefore.find((n) => n.id === nextJsId)?.percent;
    expect(percentBefore).toBeGreaterThan(0);

    const suggestionId = newId("dssug");
    await db.insert(domainSupersessionSuggestions).values({
      id: suggestionId,
      subjectId,
      domainNodeId: nextJsId,
      reason: "stub supersession reason",
      source: "doc-scan",
      status: "pending",
    });

    const { handleResolveDomainSupersessionSuggestion } = await import("./domain-map.controller.js");

    const req = fakeRequest({ status: "accepted" });
    const res = fakeResponse();

    await handleResolveDomainSupersessionSuggestion(req, res, suggestionId);

    expect(res.statusCode).toBe(200);

    const nodeRow = (await db.select().from(domainNodes).where(eq(domainNodes.id, nextJsId)))[0];
    expect(nodeRow?.supersededAt).not.toBeNull();
    expect(nodeRow?.supersededReason).toBe("stub supersession reason");

    const treeAfter = await getDomainMapForSubject(subjectId);
    const percentAfter = treeAfter.find((n) => n.id === nextJsId)?.percent;

    // The negative assertion that matters: byte-identical, not merely "not
    // lower" — proves Decisions #2's "flag, never reduce percent."
    expect(percentAfter).toBe(percentBefore);
  });

  it("rejecting leaves superseded_at null", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, domainSupersessionSuggestions } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    const subjectId = newId("sub");
    const nextJsId = newId("dnode");

    await db.insert(subjects).values({ id: subjectId, name: `E2E Supersession Reject ${subjectId}` });
    await db.insert(domainNodes).values({ id: nextJsId, subjectId, parentId: null, name: "Next.js", order: 0 });

    const suggestionId = newId("dssug");
    await db.insert(domainSupersessionSuggestions).values({
      id: suggestionId,
      subjectId,
      domainNodeId: nextJsId,
      reason: "stub supersession reason",
      source: "doc-scan",
      status: "pending",
    });

    const { handleResolveDomainSupersessionSuggestion } = await import("./domain-map.controller.js");

    const req = fakeRequest({ status: "rejected" });
    const res = fakeResponse();

    await handleResolveDomainSupersessionSuggestion(req, res, suggestionId);

    expect(res.statusCode).toBe(200);

    const nodeRow = (await db.select().from(domainNodes).where(eq(domainNodes.id, nextJsId)))[0];
    expect(nodeRow?.supersededAt).toBeNull();

    const suggestionRow = (
      await db
        .select()
        .from(domainSupersessionSuggestions)
        .where(eq(domainSupersessionSuggestions.id, suggestionId))
    )[0];
    expect(suggestionRow?.status).toBe("rejected");
  });
});
