import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The double-click / double-PATCH proof for resolvePrioritySuggestion —
// the sibling of suggestion-double-resolve.integration.test.ts's own proof
// for resolveDomainTopicSuggestion/resolveDomainSupersessionSuggestion
// (.planning/TODO.md — "resolvePrioritySuggestion() has no claim guard —
// left alone since it's idempotent"). Accepting the same suggestion twice
// was always idempotent in its EFFECT (the second accept re-writes the
// same target_depth), but before the fix it never refused the second call —
// this proves the claim-first guard now makes it refuse cleanly instead.
//
// Real Postgres (the e2e docker-compose DB on localhost:5436, never mocked)
// — a WHERE status = 'pending' claim only means anything against a real
// engine's row-level locking and READ COMMITTED re-check.
//
// Kept as its own file rather than added to suggestion-double-resolve's
// tail, since that file was mid-edit elsewhere at the time this was written.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as db/migrations.integration.test.ts and seed-domain-nodes.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `prio_sugg_double_resolve_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { resolvePrioritySuggestion } = await import("./domain-map.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertSubject(subjectId: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `priority double-resolve subject ${subjectId}`],
  );
}

async function insertDomainNodeRow(
  nodeId: string,
  subjectId: string,
  targetDepth: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", target_depth)
     VALUES ($1, $2, NULL, 'Node under review', 0, $3)`,
    [nodeId, subjectId, targetDepth],
  );
}

async function insertPendingPrioritySuggestion(
  suggestionId: string,
  subjectId: string,
  domainNodeId: string,
  suggestedTargetDepth: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_priority_suggestions
       (id, subject_id, domain_node_id, suggested_target_depth, reason, source)
     VALUES ($1, $2, $3, $4, 'proposed by the priority review', 'priority-review')`,
    [suggestionId, subjectId, domainNodeId, suggestedTargetDepth],
  );
}

async function nodeTargetDepth(nodeId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT target_depth FROM domain_nodes WHERE id = $1`, [
    nodeId,
  ]);

  return rows.length === 0 ? null : (rows[0]!.target_depth as string | null);
}

function isRefusal(outcome: unknown): outcome is { error: string } {
  return typeof outcome === "object" && outcome !== null && "error" in outcome;
}

describe("accepting the same pending priority suggestion twice", () => {
  it("keeps the target_depth stable when the second accept follows the first sequentially", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const nodeId = id("dnode");
    await insertDomainNodeRow(nodeId, subjectId, "shallow");

    const suggestionId = id("dpsug");
    await insertPendingPrioritySuggestion(suggestionId, subjectId, nodeId, "deep");

    const first = await resolvePrioritySuggestion(suggestionId, "accepted");
    const second = await resolvePrioritySuggestion(suggestionId, "accepted");

    expect(isRefusal(first)).toBe(false);
    expect(isRefusal(second)).toBe(true);
    expect((second as { error: string }).error).toBe("already_resolved");

    expect(await nodeTargetDepth(nodeId)).toBe("deep");

    const { rows } = await client.query(
      `SELECT status FROM domain_priority_suggestions WHERE id = $1`,
      [suggestionId],
    );
    expect(rows[0]!.status).toBe("accepted");
  }, 30_000);

  it("resolves exactly once when two accepts race concurrently", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const nodeId = id("dnode");
    await insertDomainNodeRow(nodeId, subjectId, "shallow");

    const suggestionId = id("dpsug");
    await insertPendingPrioritySuggestion(suggestionId, subjectId, nodeId, "deep");

    const outcomes = await Promise.all([
      resolvePrioritySuggestion(suggestionId, "accepted"),
      resolvePrioritySuggestion(suggestionId, "accepted"),
    ]);

    expect(outcomes.filter((outcome) => !isRefusal(outcome))).toHaveLength(1);
    expect(outcomes.filter(isRefusal)).toHaveLength(1);

    expect(await nodeTargetDepth(nodeId)).toBe("deep");
  }, 30_000);

  it("refuses a second accept after a reject, leaving the node untouched", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const nodeId = id("dnode");
    await insertDomainNodeRow(nodeId, subjectId, "shallow");

    const suggestionId = id("dpsug");
    await insertPendingPrioritySuggestion(suggestionId, subjectId, nodeId, "deep");

    await resolvePrioritySuggestion(suggestionId, "rejected");
    const second = await resolvePrioritySuggestion(suggestionId, "accepted");

    expect(isRefusal(second)).toBe(true);
    expect(await nodeTargetDepth(nodeId)).toBe("shallow");

    const { rows } = await client.query(
      `SELECT status FROM domain_priority_suggestions WHERE id = $1`,
      [suggestionId],
    );
    expect(rows[0]!.status).toBe("rejected");
  }, 30_000);

  it("returns not_found for a suggestion id that never existed", async () => {
    const outcome = await resolvePrioritySuggestion(id("dpsug"), "accepted");

    expect(isRefusal(outcome)).toBe(true);
    expect((outcome as { error: string }).error).toBe("not_found");
  }, 30_000);
});
