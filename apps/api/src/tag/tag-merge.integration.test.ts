import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 3 + SCENARIO 4 (.planning/ontology-split-merge/scenarios.md) —
// real-Postgres proof of mergeTags' full reassignment contract: the
// dedupe-before-bulk-update ordering (a node tagged with both source and
// target ends with exactly one assignment, pointing at target), the
// plain-move path (a node tagged with source only ends up tagged with
// target), and — SCENARIO 4's own backend-only case — an active
// tag-scoped probe_sessions row surviving the merge by scope_id
// reassignment, including the "neither tag has a session" zero-row edge and
// the "both tags already have their own session" tie-break edge.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { mergeTags } = await import("./tag.repo.js");
const { getActiveSessionRow } = await import("../probe-session/probe-session.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
});

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertTag(tagId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, lower($2))`,
    [tagId, name],
  );
}

async function insertAssignment(tagId: string, nodeType: "module" | "topic", nodeId: string): Promise<void> {
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, $3, $4)`,
    [id("tga"), tagId, nodeType, nodeId],
  );
}

async function insertProbeSession(sessionId: string, scopeId: string, status: "active" | "completed"): Promise<void> {
  await client.query(
    `INSERT INTO probe_sessions (id, scope, scope_id, status) VALUES ($1, 'tag', $2, $3)`,
    [sessionId, scopeId, status],
  );
}

interface MergeOutcome {
  error?: string;
  targetTagId?: string;
  sourceTagId?: string;
  assignmentsMoved?: number;
  assignmentsDeduped?: number;
  sessionsMoved?: number;
}

describe("SCENARIO 3 — merging two tags dedupes a double-tagged node and moves the rest", () => {
  it("a node tagged with both source and target ends with exactly one assignment, and a source-only node moves to target", async () => {
    const targetTagId = id("tag");
    const sourceTagId = id("tag");
    const sharedNodeId = id("topic");
    const sourceOnlyNodeId = id("module");

    await insertTag(targetTagId, `react-${randomUUID()}`);
    await insertTag(sourceTagId, `reactjs-${randomUUID()}`);

    await insertAssignment(targetTagId, "topic", sharedNodeId);
    await insertAssignment(sourceTagId, "topic", sharedNodeId);
    await insertAssignment(sourceTagId, "module", sourceOnlyNodeId);

    const result = (await mergeTags(targetTagId, sourceTagId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.assignmentsDeduped).toBe(1);
    expect(result.assignmentsMoved).toBe(1);

    const { rows: sharedRows } = await client.query(
      `SELECT tag_id FROM tag_assignments WHERE node_type = 'topic' AND node_id = $1`,
      [sharedNodeId],
    );
    expect(sharedRows).toHaveLength(1);
    expect(sharedRows[0]!.tag_id).toBe(targetTagId);

    const { rows: movedRows } = await client.query(
      `SELECT tag_id FROM tag_assignments WHERE node_type = 'module' AND node_id = $1`,
      [sourceOnlyNodeId],
    );
    expect(movedRows).toHaveLength(1);
    expect(movedRows[0]!.tag_id).toBe(targetTagId);

    const { rows: sourceAssignments } = await client.query(
      `SELECT count(*)::int AS n FROM tag_assignments WHERE tag_id = $1`,
      [sourceTagId],
    );
    expect(sourceAssignments[0]!.n).toBe(0);

    const { rows: sourceTagRows } = await client.query(`SELECT count(*)::int AS n FROM tags WHERE id = $1`, [
      sourceTagId,
    ]);
    expect(sourceTagRows[0]!.n).toBe(0);
  });
});

describe("SCENARIO 4 — merging a tag with an active tag-scoped probe session keeps that session reachable", () => {
  it("an active session on the source tag becomes reachable under the target tag's scopeId, and the old lookup key is dead", async () => {
    const targetTagId = id("tag");
    const sourceTagId = id("tag");
    const sessionId = id("psess");

    await insertTag(targetTagId, `target-${randomUUID()}`);
    await insertTag(sourceTagId, `source-${randomUUID()}`);
    await insertProbeSession(sessionId, sourceTagId, "active");

    const result = (await mergeTags(targetTagId, sourceTagId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.sessionsMoved).toBe(1);

    const movedSession = await getActiveSessionRow("tag", targetTagId);
    expect(movedSession?.id).toBe(sessionId);

    const deadLookup = await getActiveSessionRow("tag", sourceTagId);
    expect(deadLookup).toBeNull();
  });

  it("a merge where neither tag has a probe_sessions row affects zero rows without erroring", async () => {
    const targetTagId = id("tag");
    const sourceTagId = id("tag");

    await insertTag(targetTagId, `target-${randomUUID()}`);
    await insertTag(sourceTagId, `source-${randomUUID()}`);

    const result = (await mergeTags(targetTagId, sourceTagId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.sessionsMoved).toBe(0);
  });

  it("when both tags already have their own active session, the merge does not error and the existing most-recent-first tie-break still resolves one winner", async () => {
    const targetTagId = id("tag");
    const sourceTagId = id("tag");
    const targetSessionId = id("psess");
    const sourceSessionId = id("psess");

    await insertTag(targetTagId, `target-${randomUUID()}`);
    await insertTag(sourceTagId, `source-${randomUUID()}`);
    await insertProbeSession(targetSessionId, targetTagId, "active");
    await insertProbeSession(sourceSessionId, sourceTagId, "active");

    const result = (await mergeTags(targetTagId, sourceTagId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.sessionsMoved).toBe(1);

    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM probe_sessions WHERE scope = 'tag' AND scope_id = $1`,
      [targetTagId],
    );
    expect(rows[0]!.n).toBe(2);

    const resolved = await getActiveSessionRow("tag", targetTagId);
    expect(resolved).not.toBeNull();
    expect([targetSessionId, sourceSessionId]).toContain(resolved!.id);
  });
});
