import { desc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ontologyMerges } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { Tx } from "../shared/merge-lock.js";

// ontology-audit-trail (issue #62) — the write/read repo for the merge audit
// log. insertOntologyMergeLog is called from inside each of the four merge
// callbacks' own open transaction (subject.repo.ts/tag.repo.ts/
// curriculum.repo.ts/domain-map.repo.ts), right before their existing
// return — never from outside a transaction, and never wraps its own
// try/catch, so a failed insert propagates and rolls back the whole merge
// with it (spec.md's "Where the log write happens").

export type OntologyMergeEntityType = "subject" | "tag" | "curriculum" | "domain_node";

export interface InsertOntologyMergeLogParams {
  entityType: OntologyMergeEntityType;
  targetId: string;
  targetName: string;
  sourceId: string;
  sourceName: string;
  reassignedCounts: Record<string, number>;
  // Defaults to `new Date()` below, never left to Postgres's own `now()`
  // default — `now()` resolves to transaction-start time, so several rows
  // inserted inside one transaction (or in quick succession, as tests that
  // seed multiple rows do) would otherwise get identical or ambiguously
  // ordered timestamps.
  createdAt?: Date;
}

export async function insertOntologyMergeLog(
  params: InsertOntologyMergeLogParams,
  tx: Tx,
): Promise<void> {
  await tx.insert(ontologyMerges).values({
    id: newId("omrg"),
    entityType: params.entityType,
    targetId: params.targetId,
    targetName: params.targetName,
    sourceId: params.sourceId,
    sourceName: params.sourceName,
    reassignedCounts: params.reassignedCounts,
    createdAt: params.createdAt ?? new Date(),
  });
}

export interface OntologyMergeLogRow {
  id: string;
  entityType: OntologyMergeEntityType;
  targetId: string;
  targetName: string;
  sourceId: string;
  sourceName: string;
  reassignedCounts: Record<string, number>;
  createdAt: string;
}

export async function listRecentOntologyMerges(limit = 50): Promise<OntologyMergeLogRow[]> {
  const rows = await getDb()
    .select()
    .from(ontologyMerges)
    .orderBy(desc(ontologyMerges.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType as OntologyMergeEntityType,
    targetId: r.targetId,
    targetName: r.targetName,
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    reassignedCounts: r.reassignedCounts,
    createdAt: r.createdAt.toISOString(),
  }));
}
