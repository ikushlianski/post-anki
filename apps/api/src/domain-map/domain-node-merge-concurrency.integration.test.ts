import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 1 (zero-orphan proof, incl. the read-path proof) and SCENARIO 4
// (two-concurrent-merges race) from .planning/domain-node-merge/scenarios.md.
// Real Postgres (the e2e docker-compose DB on localhost:5436, never mocked).
// The race shape mirrors subject-merge-concurrency.integration.test.ts
// exactly: two concurrent calls fired via Promise.all, mergeDomainNodes
// never throws on a lost race — it returns a discriminated
// { error: "not_found" } result instead.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { mergeDomainNodes, getDomainMapForSubject } = await import("./domain-map.repo.js");

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

async function insertSubject(subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, name],
  );
}

async function insertDomainNode(
  nodeId: string,
  subjectId: string,
  parentId: string | null,
  name: string,
  order = 0,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, $3, $4, $5)`,
    [nodeId, subjectId, parentId, name, order],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string, domainNodeId: string): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, domain_node_id) VALUES ($1, $2, $3, $4)`,
    [curriculumId, subjectId, `curriculum attached to ${domainNodeId}`, domainNodeId],
  );
}

async function insertPrioritySuggestion(suggestionId: string, subjectId: string, domainNodeId: string): Promise<void> {
  await client.query(
    `INSERT INTO domain_priority_suggestions
       (id, domain_node_id, subject_id, suggested_target_depth, reason, source)
     VALUES ($1, $2, $3, 'deep', 'pending priority suggestion seeded before merge', 'general-knowledge')`,
    [suggestionId, domainNodeId, subjectId],
  );
}

async function insertTopicSuggestion(
  suggestionId: string,
  subjectId: string,
  proposedParentNodeId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_topic_suggestions
       (id, subject_id, proposed_parent_node_id, proposed_node_name, reason, source)
     VALUES ($1, $2, $3, 'Proposed New Node', 'doc-scan proposal seeded before merge', 'doc-scan')`,
    [suggestionId, subjectId, proposedParentNodeId],
  );
}

interface MergeOutcome {
  error?: string;
  targetDomainNodeId?: string;
  sourceDomainNodeId?: string;
  curriculaMoved?: number;
  childNodesMoved?: number;
}

function isSuccess(
  outcome: MergeOutcome,
): outcome is Required<
  Pick<MergeOutcome, "targetDomainNodeId" | "sourceDomainNodeId" | "curriculaMoved" | "childNodesMoved">
> {
  return outcome.error === undefined;
}

interface TreeNode {
  id: string;
  children: TreeNode[];
}

function findNode(tree: TreeNode[], nodeId: string): TreeNode | undefined {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }

    const found = findNode(node.children, nodeId);

    if (found) {
      return found;
    }
  }

  return undefined;
}

describe("SCENARIO 1 — zero-orphan proof: reassigned curricula, reassigned child nodes, suggestion cleanup, and the read-path proof", () => {
  it("moves curricula and child nodes onto the target, cleans up suggestion tables, and the tree-assembly read path nests the moved child under the target", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S1 zero-orphan subject");

    const targetId = id("target");
    const unrelatedParentId = id("unrelated-parent");
    const sourceId = id("source");
    const childId = id("child");

    // Deliberately NOT a direct sibling of the target — proves the picker's
    // "anywhere in the tree" design point (spec.md Decision #6) has a real
    // backend counterpart: the merge works regardless of where in the tree
    // the source sits.
    await insertDomainNode(targetId, subjectId, null, "Target A");
    await insertDomainNode(unrelatedParentId, subjectId, null, "Unrelated Parent");
    await insertDomainNode(sourceId, subjectId, unrelatedParentId, "Source B");
    await insertDomainNode(childId, subjectId, sourceId, "Child C");

    const curriculumId = id("curr");
    await insertCurriculum(curriculumId, subjectId, sourceId);

    const prioritySuggestionId = id("dpsug");
    await insertPrioritySuggestion(prioritySuggestionId, subjectId, sourceId);

    const topicSuggestionId = id("dtsug");
    await insertTopicSuggestion(topicSuggestionId, subjectId, sourceId);

    const result = (await mergeDomainNodes(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.targetDomainNodeId).toBe(targetId);
    expect(result.sourceDomainNodeId).toBe(sourceId);
    expect(result.curriculaMoved).toBe(1);
    expect(result.childNodesMoved).toBe(1);

    // The source row is gone.
    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(0);

    // The child is re-parented onto the target, not orphaned with a
    // dangling parent_id.
    const { rows: childRows } = await client.query(
      `SELECT parent_id FROM domain_nodes WHERE id = $1`,
      [childId],
    );
    expect(childRows[0]!.parent_id).toBe(targetId);

    // The curriculum is re-pointed onto the target, not orphaned with a
    // dangling domain_node_id.
    const { rows: curriculumRows } = await client.query(
      `SELECT domain_node_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );
    expect(curriculumRows[0]!.domain_node_id).toBe(targetId);

    // The ephemeral priority suggestion tied to the source is deleted, not
    // silently left dangling.
    const { rows: prioritySuggestionRows } = await client.query(
      `SELECT count(*)::int AS n FROM domain_priority_suggestions WHERE domain_node_id = $1`,
      [sourceId],
    );
    expect(prioritySuggestionRows[0]!.n).toBe(0);

    // The topic suggestion's forward-looking proposed_parent_node_id is
    // repointed at the target.
    const { rows: topicSuggestionRows } = await client.query(
      `SELECT proposed_parent_node_id FROM domain_topic_suggestions WHERE id = $1`,
      [topicSuggestionId],
    );
    expect(topicSuggestionRows[0]!.proposed_parent_node_id).toBe(targetId);

    // READ-PATH PROOF — the exact assertion this item exists to protect.
    // getDomainMapForSubject()'s buildItem() tree-assembly recursion has no
    // cycle guard of its own; it stays safe only because mergeDomainNodes'
    // own write-path guard (isAncestor) never lets a cycle land in the
    // data. This call proves that recursion actually traverses the merged,
    // re-parented shape without incident — not just that the raw rows look
    // right in isolation.
    const tree = await getDomainMapForSubject(subjectId);
    const targetNode = findNode(tree as unknown as TreeNode[], targetId);

    expect(targetNode).toBeDefined();

    const nestedChild = findNode(targetNode!.children, childId);
    expect(nestedChild).toBeDefined();
  });
});

describe("SCENARIO 4 — two concurrent merges racing for the same source node", () => {
  it("exactly one merge succeeds with real moved counts, the other resolves { error: 'not_found' } without throwing, never split ownership", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S4 concurrency subject");

    const sourceId = id("source");
    const targetBId = id("target-b");
    const targetCId = id("target-c");
    const childId = id("child");

    await insertDomainNode(sourceId, subjectId, null, "S4 Source");
    await insertDomainNode(targetBId, subjectId, null, "S4 Target B");
    await insertDomainNode(targetCId, subjectId, null, "S4 Target C");
    await insertDomainNode(childId, subjectId, sourceId, "S4 Source's Child");

    const curriculumId = id("curr");
    await insertCurriculum(curriculumId, subjectId, sourceId);

    const [resultB, resultC]: [MergeOutcome, MergeOutcome] = await Promise.all([
      mergeDomainNodes(targetBId, sourceId),
      mergeDomainNodes(targetCId, sourceId),
    ]);

    const outcomes = [resultB, resultC];
    const succeeded = outcomes.filter(isSuccess);
    const failed = outcomes.filter((o) => !isSuccess(o));

    // Non-negotiable: both promises must resolve (never reject).
    expect(outcomes).toHaveLength(2);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const winner = succeeded[0]!;
    expect(winner.curriculaMoved).toBe(1);
    expect(winner.childNodesMoved).toBe(1);
    expect(winner.sourceDomainNodeId).toBe(sourceId);

    expect(failed[0]!.error).toBe("not_found");

    const winnerId = winner.targetDomainNodeId;
    const loserId = winnerId === targetBId ? targetCId : targetBId;

    const { rows: winnerChildren } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE parent_id = $1`,
      [winnerId],
    );
    expect(winnerChildren[0]!.n).toBe(1);

    const { rows: loserChildren } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE parent_id = $1`,
      [loserId],
    );
    expect(loserChildren[0]!.n).toBe(0);

    const { rows: winnerCurricula } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE domain_node_id = $1`,
      [winnerId],
    );
    expect(winnerCurricula[0]!.n).toBe(1);

    const { rows: loserCurricula } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE domain_node_id = $1`,
      [loserId],
    );
    expect(loserCurricula[0]!.n).toBe(0);

    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(0);
  });

  it("a merge against a source that no longer exists (already merged away) returns not_found without throwing", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S4 already-gone subject");

    const sourceId = id("source-gone");
    const targetId = id("target-gone");

    await insertDomainNode(sourceId, subjectId, null, "S4 Already Gone Source");
    await insertDomainNode(targetId, subjectId, null, "S4 Already Gone Target");

    await client.query(`DELETE FROM domain_nodes WHERE id = $1`, [sourceId]);

    const result = (await mergeDomainNodes(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBe("not_found");
  });
});
