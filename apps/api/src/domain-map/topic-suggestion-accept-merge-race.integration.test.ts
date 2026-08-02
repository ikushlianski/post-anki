import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Race-condition safety: accepting a pending domain_topic_suggestion
// inserts a real domain_nodes row, and mergeSubjects reassigns both the
// nodes AND the suggestions to the target before deleting the source subject.
//
// Two scenarios:
// 1. Accept races with the merge while the source subject DELETE is still
//    blocked (first test): the accept runs BEFORE the suggestions are
//    reassigned, so it tries to claim the suggestion under the source subject
//    that is about to be deleted and fails with subject_not_found.
//
// 2. Accept runs AFTER the merge is complete (second test): the suggestion
//    has been reassigned to the target subject (which still exists), so the
//    accept succeeds normally.
//
// The interleaving in test 1 is constructed, not raced for, exactly as
// curriculum-create-merge-race.integration.test.ts does it: a second
// connection holds `SELECT ... FOR UPDATE` on the source subject row, which
// parks the real mergeSubjects on its own `DELETE FROM subjects` while it
// still holds both advisory locks, and the accept is fired into that window.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { mergeSubjects } = await import("../subject/subject.repo.js");
const { resolveDomainTopicSuggestion } = await import("./domain-map.repo.js");

let client: pg.Client;
let pauseClient: pg.Client;

const createdSubjectIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  pauseClient = new pg.Client({ connectionString: DATABASE_URL });
  await pauseClient.connect();
}, 30_000);

afterAll(async () => {
  if (client && createdSubjectIds.length > 0) {
    await client.query(`DELETE FROM domain_topic_suggestions WHERE subject_id = ANY($1)`, [
      createdSubjectIds,
    ]);
    await client.query(`DELETE FROM domain_nodes WHERE subject_id = ANY($1)`, [createdSubjectIds]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await pauseClient?.end();
  await client?.end();
  await closeDb();
});

async function insertSubject(name: string): Promise<string> {
  const id = `sub_tsrace_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function insertPendingSuggestion(subjectId: string): Promise<string> {
  const nodeId = `dnode_tsrace_${randomUUID()}`;
  const suggestionId = `dtsug_tsrace_${randomUUID()}`;

  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, null, 'Frontend', 0)`,
    [nodeId, subjectId],
  );
  await client.query(
    `INSERT INTO domain_topic_suggestions
       (id, subject_id, proposed_parent_node_id, proposed_node_name, reason, source)
     VALUES ($1, $2, $3, 'Astro', 'proposed by the doc scan', 'doc-scan')`,
    [suggestionId, subjectId, nodeId],
  );

  return suggestionId;
}

async function countDomainNodesFor(subjectId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM domain_nodes WHERE subject_id = $1`,
    [subjectId],
  );

  return rows[0]!.n as number;
}

async function suggestionStatus(suggestionId: string): Promise<string> {
  const { rows } = await client.query(
    `SELECT status FROM domain_topic_suggestions WHERE id = $1`,
    [suggestionId],
  );

  return rows[0]!.status as string;
}

async function waitForBlockedSubjectDelete(): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND query ILIKE '%delete from "subjects"%'`,
    );

    if ((rows[0]!.n as number) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("merge never blocked on DELETE FROM subjects — the race window never opened");
}

interface ResolveOutcome {
  error?: string;
  id?: string;
  createdDomainNodeId?: string | null;
}

describe("accepting a domain topic suggestion racing a concurrent subject merge", () => {
  it("never lands a domain node under the source subject the merge is deleting", async () => {
    const sourceId = await insertSubject("Topic Suggestion Race Source");
    const targetId = await insertSubject("Topic Suggestion Race Target");
    const suggestionId = await insertPendingSuggestion(sourceId);

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM subjects WHERE id = $1 FOR UPDATE`, [sourceId]);

    const mergePromise = mergeSubjects(targetId, sourceId);

    await waitForBlockedSubjectDelete();

    const acceptPromise = resolveDomainTopicSuggestion(
      suggestionId,
      "accepted",
    ) as Promise<ResolveOutcome>;

    await new Promise((resolve) => setTimeout(resolve, 500));

    await pauseClient.query("COMMIT");

    const [, acceptResult] = await Promise.all([mergePromise, acceptPromise]);

    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM subjects WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(0);

    expect(await countDomainNodesFor(sourceId)).toBe(0);
    expect(acceptResult.error).toBe("subject_not_found");
    expect(await suggestionStatus(suggestionId)).toBe("pending");
  }, 60_000);

  it("accepts a reassigned suggestion normally after the merge completes", async () => {
    const sourceId = await insertSubject("Already Merged Suggestion Source");
    const targetId = await insertSubject("Already Merged Suggestion Target");
    const suggestionId = await insertPendingSuggestion(sourceId);

    await mergeSubjects(targetId, sourceId);

    const result = (await resolveDomainTopicSuggestion(
      suggestionId,
      "accepted",
    )) as ResolveOutcome;

    expect(result.error).toBeUndefined();
    expect(result.createdDomainNodeId).toBeTruthy();
    expect(await suggestionStatus(suggestionId)).toBe("accepted");
    expect(await countDomainNodesFor(sourceId)).toBe(0);
    expect(await countDomainNodesFor(targetId)).toBeGreaterThan(0);
  }, 30_000);

  it("still accepts normally when no merge is in flight", async () => {
    const subjectId = await insertSubject("Uncontended Suggestion Subject");
    const suggestionId = await insertPendingSuggestion(subjectId);

    const result = (await resolveDomainTopicSuggestion(
      suggestionId,
      "accepted",
    )) as ResolveOutcome;

    expect(result.error).toBeUndefined();
    expect(result.createdDomainNodeId).toBeTruthy();
    expect(await countDomainNodesFor(subjectId)).toBe(2);
    expect(await suggestionStatus(suggestionId)).toBe("accepted");
  }, 30_000);

  it("still rejects a suggestion whose subject was merged away", async () => {
    const sourceId = await insertSubject("Reject After Merge Source");
    const targetId = await insertSubject("Reject After Merge Target");
    const suggestionId = await insertPendingSuggestion(sourceId);

    await mergeSubjects(targetId, sourceId);

    const result = (await resolveDomainTopicSuggestion(
      suggestionId,
      "rejected",
    )) as ResolveOutcome;

    expect(result.error).toBeUndefined();
    expect(await suggestionStatus(suggestionId)).toBe("rejected");
  }, 30_000);
});
