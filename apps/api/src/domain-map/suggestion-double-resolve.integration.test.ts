import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The double-click / double-PATCH proof for the doc-scan review screen.
// Accepting the same pending suggestion twice must resolve it exactly once:
// the second call is an "already_resolved" refusal, never a second real
// domain_nodes row and never a second supersession flag write.
//
// Real Postgres (the e2e docker-compose DB on localhost:5436, never mocked)
// — a WHERE status = 'pending' claim only means anything against a real
// engine's row-level locking and READ COMMITTED re-check.

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

const dbName = `sugg_double_resolve_${randomUUID().replace(/-/g, "_")}`;
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

const { resolveDomainSupersessionSuggestion, resolveDomainTopicSuggestion } = await import(
  "./domain-map.repo.js"
);

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
    [subjectId, `double-resolve subject ${subjectId}`],
  );
}

async function insertDomainNodeRow(
  nodeId: string,
  subjectId: string,
  parentId: string | null,
  name: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, $3, $4, 0)`,
    [nodeId, subjectId, parentId, name],
  );
}

async function insertPendingTopicSuggestion(
  suggestionId: string,
  subjectId: string,
  proposedParentNodeId: string,
  proposedNodeName: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_topic_suggestions
       (id, subject_id, proposed_parent_node_id, proposed_node_name, reason, source)
     VALUES ($1, $2, $3, $4, 'proposed by the doc scan', 'doc-scan')`,
    [suggestionId, subjectId, proposedParentNodeId, proposedNodeName],
  );
}

async function insertPendingSupersessionSuggestion(
  suggestionId: string,
  subjectId: string,
  domainNodeId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_supersession_suggestions
       (id, subject_id, domain_node_id, reason, source)
     VALUES ($1, $2, $3, 'superseded by the newer API', 'doc-scan')`,
    [suggestionId, subjectId, domainNodeId],
  );
}

async function countNodesNamed(subjectId: string, name: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM domain_nodes WHERE subject_id = $1 AND name = $2`,
    [subjectId, name],
  );

  return rows[0]!.n as number;
}

function isRefusal(outcome: unknown): outcome is { error: string } {
  return typeof outcome === "object" && outcome !== null && "error" in outcome;
}

describe("accepting the same pending topic suggestion twice", () => {
  it("creates exactly one domain node when the second accept follows the first sequentially (the plain double-click)", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const parentNodeId = id("dnode");
    await insertDomainNodeRow(parentNodeId, subjectId, null, "Parent");

    const suggestionId = id("dtsug");
    const proposedName = `Proposed ${randomUUID()}`;
    await insertPendingTopicSuggestion(suggestionId, subjectId, parentNodeId, proposedName);

    const first = await resolveDomainTopicSuggestion(suggestionId, "accepted");
    const second = await resolveDomainTopicSuggestion(suggestionId, "accepted");

    expect(await countNodesNamed(subjectId, proposedName)).toBe(1);

    expect(isRefusal(first)).toBe(false);
    expect(isRefusal(second)).toBe(true);
    expect((second as { error: string }).error).toBe("already_resolved");

    const { rows } = await client.query(
      `SELECT created_domain_node_id, status FROM domain_topic_suggestions WHERE id = $1`,
      [suggestionId],
    );
    expect(rows[0]!.status).toBe("accepted");
    expect(rows[0]!.created_domain_node_id).toBe((first as { createdDomainNodeId: string }).createdDomainNodeId);
  });

  it("creates exactly one domain node when two accepts race concurrently (two rapid PATCH calls)", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const parentNodeId = id("dnode");
    await insertDomainNodeRow(parentNodeId, subjectId, null, "Parent");

    const suggestionId = id("dtsug");
    const proposedName = `Proposed ${randomUUID()}`;
    await insertPendingTopicSuggestion(suggestionId, subjectId, parentNodeId, proposedName);

    const outcomes = await Promise.all([
      resolveDomainTopicSuggestion(suggestionId, "accepted"),
      resolveDomainTopicSuggestion(suggestionId, "accepted"),
    ]);

    expect(await countNodesNamed(subjectId, proposedName)).toBe(1);

    expect(outcomes.filter((outcome) => !isRefusal(outcome))).toHaveLength(1);
    expect(outcomes.filter(isRefusal)).toHaveLength(1);
  });

  it("refuses a second accept after a reject, leaving the rejection intact and creating no node", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const parentNodeId = id("dnode");
    await insertDomainNodeRow(parentNodeId, subjectId, null, "Parent");

    const suggestionId = id("dtsug");
    const proposedName = `Proposed ${randomUUID()}`;
    await insertPendingTopicSuggestion(suggestionId, subjectId, parentNodeId, proposedName);

    await resolveDomainTopicSuggestion(suggestionId, "rejected");
    const second = await resolveDomainTopicSuggestion(suggestionId, "accepted");

    expect(isRefusal(second)).toBe(true);
    expect(await countNodesNamed(subjectId, proposedName)).toBe(0);

    const { rows } = await client.query(
      `SELECT status FROM domain_topic_suggestions WHERE id = $1`,
      [suggestionId],
    );
    expect(rows[0]!.status).toBe("rejected");
  });

  it("returns not_found for a suggestion id that never existed", async () => {
    const outcome = await resolveDomainTopicSuggestion(id("dtsug"), "accepted");

    expect(isRefusal(outcome)).toBe(true);
    expect((outcome as { error: string }).error).toBe("not_found");
  });
});

describe("accepting the same pending supersession suggestion twice", () => {
  it("keeps the first flag's timestamp when the second accept follows sequentially", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const nodeId = id("dnode");
    await insertDomainNodeRow(nodeId, subjectId, null, "Outdated Node");

    const suggestionId = id("dssug");
    await insertPendingSupersessionSuggestion(suggestionId, subjectId, nodeId);

    const first = await resolveDomainSupersessionSuggestion(suggestionId, "accepted");

    const { rows: afterFirst } = await client.query(
      `SELECT superseded_at FROM domain_nodes WHERE id = $1`,
      [nodeId],
    );
    const firstFlaggedAt = afterFirst[0]!.superseded_at as Date;

    const second = await resolveDomainSupersessionSuggestion(suggestionId, "accepted");

    expect(isRefusal(first)).toBe(false);
    expect(isRefusal(second)).toBe(true);
    expect((second as { error: string }).error).toBe("already_resolved");

    const { rows: afterSecond } = await client.query(
      `SELECT superseded_at FROM domain_nodes WHERE id = $1`,
      [nodeId],
    );
    expect((afterSecond[0]!.superseded_at as Date).toISOString()).toBe(
      firstFlaggedAt.toISOString(),
    );
  });

  it("resolves exactly once when two accepts race concurrently", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const nodeId = id("dnode");
    await insertDomainNodeRow(nodeId, subjectId, null, "Outdated Node");

    const suggestionId = id("dssug");
    await insertPendingSupersessionSuggestion(suggestionId, subjectId, nodeId);

    const outcomes = await Promise.all([
      resolveDomainSupersessionSuggestion(suggestionId, "accepted"),
      resolveDomainSupersessionSuggestion(suggestionId, "accepted"),
    ]);

    expect(outcomes.filter((outcome) => !isRefusal(outcome))).toHaveLength(1);
    expect(outcomes.filter(isRefusal)).toHaveLength(1);
  });
});
