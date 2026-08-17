import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The merged-away subject's doc-scan/priority suggestions (.planning/todo.md —
// "Residual for the subject-module owner ... mergeSubjects() reassigns
// curricula and domain_nodes but touches NEITHER domain_topic_suggestions NOR
// domain_supersession_suggestions"). Before the fix those rows kept pointing at
// the deleted source subject id, so the review panel — which lists strictly by
// subjectId — could never show them and accepting one answered
// subject_not_found forever.
//
// Asserted through the real read/resolve paths rather than raw SQL, because
// "visible" and "resolvable" are exactly what the panel does: list by subject,
// then PATCH. The raw client is used only for seeding and for the closing
// dangling-pointer sweep.
//
// Same real-Postgres rules as every other *.integration.test.ts here: the e2e
// docker-compose DB on localhost:5436, never mocked, DATABASE_URL asserted
// local-only before anything opens a connection.

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

const dbName = `subj_merge_sugg_${randomUUID().replace(/-/g, "_")}`;
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

const { mergeSubjects } = await import("./subject.repo.js");
const {
  listDomainSupersessionSuggestions,
  listDomainTopicSuggestions,
  listPrioritySuggestionsForSubject,
  resolveDomainTopicSuggestion,
} = await import("../domain-map/domain-map.repo.js");

let client: pg.Client;

const createdSubjectIds: string[] = [];
const createdSuggestionIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  if (client && createdSubjectIds.length > 0) {
    await client.query(`DELETE FROM domain_topic_suggestions WHERE id = ANY($1)`, [
      createdSuggestionIds,
    ]);
    await client.query(`DELETE FROM domain_supersession_suggestions WHERE id = ANY($1)`, [
      createdSuggestionIds,
    ]);
    await client.query(`DELETE FROM domain_priority_suggestions WHERE id = ANY($1)`, [
      createdSuggestionIds,
    ]);
    await client.query(`DELETE FROM domain_nodes WHERE subject_id = ANY($1)`, [createdSubjectIds]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function insertSubject(name: string): Promise<string> {
  const id = `sub_sugmerge_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function insertDomainNode(subjectId: string, name: string): Promise<string> {
  const id = `dnode_sugmerge_${randomUUID()}`;

  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, NULL, $3, 0)`,
    [id, subjectId, name],
  );

  return id;
}

async function insertTopicSuggestion(
  subjectId: string,
  proposedParentNodeId: string | null,
  status: string,
): Promise<string> {
  const id = `dtsug_sugmerge_${randomUUID()}`;

  await client.query(
    `INSERT INTO domain_topic_suggestions
       (id, subject_id, proposed_parent_node_id, proposed_node_name, reason, source, status)
     VALUES ($1, $2, $3, $4, 'seeded by the reassignment test', 'doc-scan', $5)`,
    [id, subjectId, proposedParentNodeId, `Topic ${id.slice(-6)}`, status],
  );
  createdSuggestionIds.push(id);

  return id;
}

async function insertSupersessionSuggestion(
  subjectId: string,
  domainNodeId: string,
  status: string,
): Promise<string> {
  const id = `dssug_sugmerge_${randomUUID()}`;

  await client.query(
    `INSERT INTO domain_supersession_suggestions
       (id, subject_id, domain_node_id, reason, source, status)
     VALUES ($1, $2, $3, 'seeded by the reassignment test', 'doc-scan', $4)`,
    [id, subjectId, domainNodeId, status],
  );
  createdSuggestionIds.push(id);

  return id;
}

async function insertPrioritySuggestion(
  subjectId: string,
  domainNodeId: string,
  status: string,
): Promise<string> {
  const id = `dpsug_sugmerge_${randomUUID()}`;

  await client.query(
    `INSERT INTO domain_priority_suggestions
       (id, subject_id, domain_node_id, suggested_target_depth, reason, source, status)
     VALUES ($1, $2, $3, 'deep', 'seeded by the reassignment test', 'doc-scan', $4)`,
    [id, subjectId, domainNodeId, status],
  );
  createdSuggestionIds.push(id);

  return id;
}

async function subjectIdOf(table: string, suggestionId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT subject_id FROM ${table} WHERE id = $1`, [
    suggestionId,
  ]);

  return rows.length === 0 ? null : (rows[0]!.subject_id as string);
}

async function danglingSuggestionCount(): Promise<number> {
  const { rows } = await client.query(
    `SELECT
       (SELECT count(*) FROM domain_topic_suggestions t
          WHERE t.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.id = t.subject_id))
     + (SELECT count(*) FROM domain_supersession_suggestions p
          WHERE p.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.id = p.subject_id))
     + (SELECT count(*) FROM domain_priority_suggestions r
          WHERE r.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.id = r.subject_id))
       AS n`,
    [createdSuggestionIds],
  );

  return Number(rows[0]!.n);
}

async function domainNodeSubjectId(nodeId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT subject_id FROM domain_nodes WHERE id = $1`, [nodeId]);

  return rows.length === 0 ? null : (rows[0]!.subject_id as string);
}

interface MergeOutcome {
  error?: string;
}

describe("mergeSubjects and the source subject's pending suggestions", () => {
  it("makes the source's pending doc-scan suggestions visible under the target", async () => {
    const sourceId = await insertSubject("Suggestion Reassign Source");
    const targetId = await insertSubject("Suggestion Reassign Target");
    const nodeId = await insertDomainNode(sourceId, "Node the suggestions point at");

    const topicId = await insertTopicSuggestion(sourceId, nodeId, "pending");
    const supersessionId = await insertSupersessionSuggestion(sourceId, nodeId, "pending");
    const priorityId = await insertPrioritySuggestion(sourceId, nodeId, "pending");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    const topics = await listDomainTopicSuggestions(targetId, "pending");
    expect(topics.map((s) => s.id)).toContain(topicId);

    const supersessions = await listDomainSupersessionSuggestions(targetId, "pending");
    expect(supersessions.map((s) => s.id)).toContain(supersessionId);

    const priorities = await listPrioritySuggestionsForSubject(targetId, "pending");
    expect(priorities.map((s) => s.id)).toContain(priorityId);

    expect(await listDomainTopicSuggestions(sourceId, "pending")).toHaveLength(0);
    expect(await listDomainSupersessionSuggestions(sourceId, "pending")).toHaveLength(0);
    expect(await listPrioritySuggestionsForSubject(sourceId, "pending")).toHaveLength(0);
  }, 30_000);

  it("leaves a reassigned topic suggestion resolvable, attaching its node under the target", async () => {
    const sourceId = await insertSubject("Suggestion Resolve Source");
    const targetId = await insertSubject("Suggestion Resolve Target");
    const nodeId = await insertDomainNode(sourceId, "Parent that moves with the merge");

    const topicId = await insertTopicSuggestion(sourceId, nodeId, "pending");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    const resolved = await resolveDomainTopicSuggestion(topicId, "accepted");

    expect(resolved).not.toHaveProperty("error");

    const createdNodeId = (resolved as { createdDomainNodeId?: string }).createdDomainNodeId;
    expect(createdNodeId).toBeTruthy();
    expect(await domainNodeSubjectId(createdNodeId!)).toBe(targetId);
    expect(await domainNodeSubjectId(nodeId)).toBe(targetId);
  }, 30_000);

  it("re-roots a root-level topic suggestion under the target's root", async () => {
    const sourceId = await insertSubject("Root Suggestion Source");
    const targetId = await insertSubject("Root Suggestion Target");

    const topicId = await insertTopicSuggestion(sourceId, null, "pending");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    const topics = await listDomainTopicSuggestions(targetId, "pending");
    expect(topics.map((s) => s.id)).toContain(topicId);

    const resolved = await resolveDomainTopicSuggestion(topicId, "accepted");
    expect(resolved).not.toHaveProperty("error");

    const createdNodeId = (resolved as { createdDomainNodeId?: string }).createdDomainNodeId;
    const { rows } = await client.query(
      `SELECT subject_id, parent_id FROM domain_nodes WHERE id = $1`,
      [createdNodeId],
    );
    expect(rows[0]!.subject_id).toBe(targetId);
    expect(rows[0]!.parent_id).toBeNull();
  }, 30_000);

  it("moves already-resolved suggestions too, so no row points at a deleted subject", async () => {
    const sourceId = await insertSubject("Resolved History Source");
    const targetId = await insertSubject("Resolved History Target");
    const nodeId = await insertDomainNode(sourceId, "Node with resolved history");

    const acceptedTopicId = await insertTopicSuggestion(sourceId, nodeId, "accepted");
    const rejectedSupersessionId = await insertSupersessionSuggestion(sourceId, nodeId, "rejected");
    const rejectedPriorityId = await insertPrioritySuggestion(sourceId, nodeId, "rejected");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    expect(await subjectIdOf("domain_topic_suggestions", acceptedTopicId)).toBe(targetId);
    expect(await subjectIdOf("domain_supersession_suggestions", rejectedSupersessionId)).toBe(
      targetId,
    );
    expect(await subjectIdOf("domain_priority_suggestions", rejectedPriorityId)).toBe(targetId);

    expect(await danglingSuggestionCount()).toBe(0);
  }, 30_000);
});
