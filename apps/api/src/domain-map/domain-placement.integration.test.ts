import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIO 6 (.planning/seed-knowledge-map/scenarios.md), stronger DoD wording
// from spec.md's "Definition of Done — per layer / Backend": the agent-
// failure fallback must be proven "by asserting the HTTP response status and
// a real SELECT on the inserted row, not just that no exception was thrown."
// domain-placement.orchestrator.test.ts (mocked repo + mocked agent) proves
// resolveDomainPlacement()'s own return value; THIS file proves the whole
// request path — a real POST /curricula-shaped call into
// handleCreateCurriculum, against a real freshly-migrated throwaway
// Postgres, with only the sibling-discovery agent call mocked to reject —
// still completes successfully and persists domain_node_id: null.
//
// Split into its own *.integration.test.ts file rather than folded into
// domain-placement.orchestrator.test.ts: that file's `src/**/*.test.ts`
// glob puts it in the fast, DB-free `npm run test` sweep (see
// apps/api/vitest.config.ts's own comment — every test there is
// pure/mocked); a real-Postgres test belongs in the *.integration.test.ts
// lane instead, run via `npm run test:integration`, matching this
// project's existing convention (db/migrations.integration.test.ts,
// practice/phrase-bank-concurrency.integration.test.ts).
//
// RED right now: the mocked mastra module only needs to exist for the
// import to resolve, but handleCreateCurriculum's own domain-placement wiring
// (calling resolveDomainPlacement before createCurriculum inserts the row)
// does not exist yet, and the `domain_node_id` column does not exist on
// `curricula` yet — the final SELECT assertion below cannot pass either way.

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
    curriculumArchitect: "curriculumArchitect",
    siblingDiscovery: "siblingDiscovery",
  },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const dbName = `dp_integration_${randomUUID().replace(/-/g, "_")}`;
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

describe("handleCreateCurriculum — agent-failure fallback never blocks creation (SCENARIO 6)", () => {
  it("still succeeds and persists domain_node_id: null when the sibling-discovery agent call rejects", async () => {
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, curricula, curriculumDomainNodeMappings } = await import(
      "../db/schema.js"
    );
    const { newId } = await import("../shared/id.js");
    const { handleCreateCurriculum } = await import("../curriculum/curriculum.controller.js");

    const db = getDb();
    const subjectId = newId("sub");

    // A subject with at least one domain_nodes row — required for placement
    // (paths 2/3) to run at all; without a tree, gating skips placement
    // entirely and the agent would never be called, which would prove
    // nothing about this scenario's own fallback behavior.
    await db.insert(subjects).values({ id: subjectId, name: `E2E Subject ${subjectId}` });
    await db.insert(domainNodes).values({
      id: newId("dnode"),
      subjectId,
      parentId: null,
      name: "Frontend",
      order: 0,
    });

    const req = fakeRequest({
      subjectId,
      name: "A Genuinely Unmatched Topic Name",
    });
    const res = fakeResponse();

    await handleCreateCurriculum(req, res);

    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);

    const created = JSON.parse(res.body) as { id: string };

    const rows = await db.select().from(curricula).where(eq(curricula.id, created.id));

    expect(rows).toHaveLength(1);

    const mappingRows = await db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.curriculumId, created.id));

    expect(mappingRows).toHaveLength(0);
  });
});
