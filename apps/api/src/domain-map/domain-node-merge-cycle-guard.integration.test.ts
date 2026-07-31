import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 3 (.planning/domain-node-merge/scenarios.md) — the malformed-merge
// rejection proof. This is the first merge in this codebase that re-parents
// an existing row, which is exactly why it needs its own write-blocking
// cycle guard (isAncestor, packages/core/src/domain-map/domain-map-progress.ts)
// before mergeDomainNodes ever reassigns a single row — see spec.md's
// "Cycle-guard design". Real Postgres (the e2e docker-compose DB on
// localhost:5436, never mocked), mirrors
// curriculum-merge-target-failed-precondition.integration.test.ts's own
// "trip the guard -> assert error + zero mutation" shape.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { mergeDomainNodes } = await import("./domain-map.repo.js");

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

async function parentIdOf(nodeId: string): Promise<string | null> {
  const { rows } = await client.query(`SELECT parent_id FROM domain_nodes WHERE id = $1`, [
    nodeId,
  ]);

  return rows[0]?.parent_id ?? null;
}

async function countNode(nodeId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM domain_nodes WHERE id = $1`,
    [nodeId],
  );

  return rows[0]!.n;
}

interface MergeOutcome {
  error?: string;
  targetDomainNodeId?: string;
  sourceDomainNodeId?: string;
  curriculaMoved?: number;
  childNodesMoved?: number;
}

describe("cycle guard — a merge that would create an impossible parent/child loop is rejected, not corrupted", () => {
  it("rejects a 3-level cycle (B -> C -> A, merge B into A) with { error: 'cycle' } and mutates nothing", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "cycle-guard 3-level subject");

    const bId = id("b");
    const cId = id("c");
    const aId = id("a");

    // B is A's grandparent: B -> C -> A.
    await insertDomainNode(bId, subjectId, null, "B (source, grandparent)");
    await insertDomainNode(cId, subjectId, bId, "C (B's child, A's parent)");
    await insertDomainNode(aId, subjectId, cId, "A (target, C's child)");

    const result = (await mergeDomainNodes(aId, bId)) as MergeOutcome;

    expect(result.error).toBe("cycle");

    // Byte-for-byte unchanged — zero writes, not a partial mutation.
    expect(await parentIdOf(cId)).toBe(bId);
    expect(await parentIdOf(aId)).toBe(cId);
    expect(await countNode(aId)).toBe(1);
    expect(await countNode(bId)).toBe(1);
  });

  // The argument-order regression test's write-path half (the pure-function
  // half lives in domain-map-progress.test.ts's isAncestor coverage). The
  // safe, ordinary "collapse a level" case — merging a node into its own
  // direct parent — must still succeed. Paired with the case above: a
  // transposed isAncestor(a, b) call inside mergeDomainNodes would wrongly
  // let the 3-level cycle through AND wrongly reject this safe case at the
  // same time, so neither test alone catches that bug, but the pair does.
  it("allows merging a node into its own direct parent (the safe 'collapse a level' case)", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "collapse-a-level subject");

    const bId = id("b");
    const cId = id("c");

    await insertDomainNode(bId, subjectId, null, "B (target, parent)");
    await insertDomainNode(cId, subjectId, bId, "C (source, direct child of B)");

    const result = (await mergeDomainNodes(bId, cId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.targetDomainNodeId).toBe(bId);
    expect(result.sourceDomainNodeId).toBe(cId);

    // The source row is gone — a genuinely successful merge, not a no-op.
    expect(await countNode(cId)).toBe(0);
  });

  // CHAIN_DEPTH tied explicitly to domainNodeProgress()'s MAX_DEPTH = 6
  // (packages/core/src/domain-map/domain-map-progress.ts) so the
  // relationship survives a future cap change there — this is the concrete
  // regression test for the mistake spec.md explicitly warns against:
  // reusing that depth cap here would silently let a cycle 7+ levels up
  // through undetected, corrupting the tree instead of rejecting the merge.
  const CHAIN_DEPTH = 9;

  it(`rejects a cycle at chain depth ${CHAIN_DEPTH} — past domainNodeProgress's MAX_DEPTH = 6, proving no depth cap applies to the cycle guard`, async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "deep-chain cycle subject");

    const nodeIds: string[] = [];

    for (let i = 0; i <= CHAIN_DEPTH; i += 1) {
      nodeIds.push(id(`n${i}`));
    }

    // n0 (root, the merge SOURCE) -> n1 -> n2 -> ... -> n9 (the merge
    // TARGET). n9 sits inside n0's own subtree, so merging n0 into n9
    // would create the same "re-parent an ancestor onto its own
    // descendant" cycle as the 3-level case above, just far deeper.
    await insertDomainNode(nodeIds[0]!, subjectId, null, "n0 (source, root)");

    for (let i = 1; i <= CHAIN_DEPTH; i += 1) {
      await insertDomainNode(nodeIds[i]!, subjectId, nodeIds[i - 1]!, `n${i}`);
    }

    const sourceId = nodeIds[0]!;
    const targetId = nodeIds[CHAIN_DEPTH]!;

    const result = (await mergeDomainNodes(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBe("cycle");

    // Every hop in the chain is untouched.
    for (let i = 1; i <= CHAIN_DEPTH; i += 1) {
      expect(await parentIdOf(nodeIds[i]!)).toBe(nodeIds[i - 1]!);
    }

    expect(await countNode(sourceId)).toBe(1);
  });
});
