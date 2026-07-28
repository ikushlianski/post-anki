import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIOS 4 and 8 (.planning/domain-priority-review/scenarios.md).
//
// S4: triggering a review with zero existing target depths still succeeds —
// the agent is called exactly once with the whole tree, and every resolved
// suggestion becomes a real domain_priority_suggestions row
// (source: "general-knowledge", status: "pending"). A suggestion whose
// nodePath doesn't resolve to a real node is dropped silently, never
// inserted.
//
// S8: this review trigger is a foreground, user-waited-on action — unlike
// domain-placement.orchestrator.ts's silent agent-failure fallback, a failed
// agent call here must propagate as a real, visible error: the orchestrator
// throws, the controller responds 502 with a non-empty message, and zero
// rows are inserted (proven by a real SELECT, not just "no exception").
//
// This file deliberately touches a real, freshly-migrated throwaway
// Postgres rather than mocking the repo layer (unlike
// domain-placement.orchestrator.test.ts) because spec.md's Definition of
// Done requires "a real SELECT" as proof for both scenarios, which a
// mocked-repo shape can't produce. Only the mastra agent call is mocked.
// Kept at this exact path (not *.integration.test.ts) because spec.md's DoD
// pins this precise file+command
// (`npx vitest run apps/api/src/domain-map/domain-priority-review.orchestrator.test.ts`);
// vitest.config.ts's exclude list carries this exact filename as a named
// exception so it still doesn't leak into the fast, DB-free `npm run test`
// sweep (see that file's own comment).
//
// RED right now: apps/api/src/domain-map/domain-priority-review.orchestrator.ts
// does not exist (import fails to resolve), domain_priority_suggestions
// doesn't exist as a table, and domain_nodes has no target_depth column —
// every assertion below is unreachable until those are built.

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

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: {
    domainPriorityReview: "domainPriorityReview",
  },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const dbName = `dpr_orchestrator_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;

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

async function seedTree(): Promise<{ subjectId: string; frontendId: string; nextJsId: string }> {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const frontendId = newId("dnode");
  const nextJsId = newId("dnode");

  await db.insert(subjects).values({ id: subjectId, name: `E2E DPR Subject ${subjectId}` });
  await db.insert(domainNodes).values([
    { id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0 },
    { id: nextJsId, subjectId, parentId: frontendId, name: "Next.js", order: 0 },
  ]);

  return { subjectId, frontendId, nextJsId };
}

describe("triggerDomainPriorityReview — SCENARIO 4 (successful review, exactly one agent call)", () => {
  it("inserts exactly one row per resolved suggestion, drops unresolvable paths, calls the agent exactly once", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({
      object: {
        suggestions: [
          {
            nodePath: ["root", "Frontend", "Next.js"],
            suggestedTargetDepth: "deep",
            reason: "Next.js is core to this subject's frontend stack.",
          },
          {
            nodePath: ["root", "Frontend"],
            suggestedTargetDepth: "working",
            reason: "Frontend fundamentals matter broadly.",
          },
          {
            nodePath: ["root", "NoSuchArea", "Nowhere"],
            suggestedTargetDepth: "awareness",
            reason: "This path resolves to nothing real in the seeded tree.",
          },
        ],
      },
    });

    const { subjectId, frontendId, nextJsId } = await seedTree();

    const { triggerDomainPriorityReview } = await import(
      "./domain-priority-review.orchestrator.js"
    );

    const result = await triggerDomainPriorityReview(subjectId);

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);

    const { getDb } = await import("../db/client.js");
    const { domainPrioritySuggestions } = await import("../db/schema.js");
    const db = getDb();

    const rows = await db
      .select()
      .from(domainPrioritySuggestions)
      .where(eq(domainPrioritySuggestions.subjectId, subjectId));

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.source).toBe("general-knowledge");
      expect(row.status).toBe("pending");
      expect(row.currentTargetDepth).toBeNull();
    }

    const nodeIds = rows.map((row) => row.domainNodeId).sort();
    expect(nodeIds).toEqual([frontendId, nextJsId].sort());
  });
});

describe("triggerDomainPriorityReview — SCENARIO 8 (agent failure surfaces a real, visible error)", () => {
  it("propagates a rejected agent call as a thrown error, with zero rows inserted", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const { subjectId } = await seedTree();

    const { triggerDomainPriorityReview } = await import(
      "./domain-priority-review.orchestrator.js"
    );

    await expect(triggerDomainPriorityReview(subjectId)).rejects.toThrow();

    const { getDb } = await import("../db/client.js");
    const { domainPrioritySuggestions } = await import("../db/schema.js");
    const db = getDb();

    const rows = await db
      .select()
      .from(domainPrioritySuggestions)
      .where(eq(domainPrioritySuggestions.subjectId, subjectId));

    expect(rows).toHaveLength(0);
  });

  it("treats a schema-invalid agent response the same as a network failure — throws, zero rows inserted", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({
      object: {
        suggestions: [{ nodePath: ["root"], suggestedTargetDepth: "not-a-real-depth" }],
      },
    });

    const { subjectId } = await seedTree();

    const { triggerDomainPriorityReview } = await import(
      "./domain-priority-review.orchestrator.js"
    );

    await expect(triggerDomainPriorityReview(subjectId)).rejects.toThrow();

    const { getDb } = await import("../db/client.js");
    const { domainPrioritySuggestions } = await import("../db/schema.js");
    const db = getDb();

    const rows = await db
      .select()
      .from(domainPrioritySuggestions)
      .where(eq(domainPrioritySuggestions.subjectId, subjectId));

    expect(rows).toHaveLength(0);
  });

  it("the controller surfaces the failure as HTTP 502 with a non-empty message, never a silent no-op", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const { subjectId } = await seedTree();

    const { handleTriggerDomainPriorityReview } = await import("./domain-map.controller.js");

    const req = fakeRequest({});
    const res = fakeResponse();

    await handleTriggerDomainPriorityReview(req, res, subjectId);

    expect(res.statusCode).toBe(502);

    const parsed = JSON.parse(res.body) as { error: string; message?: string };
    expect(parsed.error).toBeTruthy();
    expect(parsed.message).toBeTruthy();

    const { getDb } = await import("../db/client.js");
    const { domainPrioritySuggestions } = await import("../db/schema.js");
    const db = getDb();

    const rows = await db
      .select()
      .from(domainPrioritySuggestions)
      .where(eq(domainPrioritySuggestions.subjectId, subjectId));

    expect(rows).toHaveLength(0);
  });
});
