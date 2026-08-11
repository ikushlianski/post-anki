import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type {
  CurriculumDomainNodeMapping,
  CurriculumDomainNodeMappingSource,
  DepthLevel,
  ExistingCurriculumMatch,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, curriculumDomainNodeMappings } from "../db/schema.js";
import { newId } from "../shared/id.js";

function toMapping(
  row: typeof curriculumDomainNodeMappings.$inferSelect,
): CurriculumDomainNodeMapping {
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    domainNodeId: row.domainNodeId,
    depth: (row.depth as DepthLevel | null) ?? null,
    status: row.status as CurriculumDomainNodeMapping["status"],
    source: row.source as CurriculumDomainNodeMappingSource,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export interface SuggestedMappingInput {
  nodeId: string;
  depth: DepthLevel;
}

// SCENARIO 1 — one suggested row per taxonomy node the mapping agent
// confidently matched (already validated by partitionMappingResult
// upstream, in the orchestrator, before this is ever called — every nodeId
// here is a real, existing node). Skips inserting a duplicate suggestion for
// a (curriculumId, domainNodeId) pair that already has a non-rejected row
// (suggested or confirmed) — a re-trigger of the same curriculum shouldn't
// pile up repeat suggestions for a node already pending or already placed.
export async function insertSuggestedMappings(
  curriculumId: string,
  matches: SuggestedMappingInput[],
  db: DbExecutor = getDb(),
): Promise<CurriculumDomainNodeMapping[]> {
  if (matches.length === 0) {
    return [];
  }

  const existing = await db
    .select({ domainNodeId: curriculumDomainNodeMappings.domainNodeId })
    .from(curriculumDomainNodeMappings)
    .where(
      and(
        eq(curriculumDomainNodeMappings.curriculumId, curriculumId),
        ne(curriculumDomainNodeMappings.status, "rejected"),
      ),
    );
  const existingNodeIds = new Set(existing.map((row) => row.domainNodeId));

  const toInsert = matches.filter((match) => !existingNodeIds.has(match.nodeId));

  if (toInsert.length === 0) {
    return [];
  }

  const rows = toInsert.map((match) => ({
    id: newId("cdnm"),
    curriculumId,
    domainNodeId: match.nodeId,
    depth: match.depth,
    status: "suggested" as const,
    source: "ai_suggested" as const,
  }));

  await db.insert(curriculumDomainNodeMappings).values(rows);

  return rows.map((row) => ({
    id: row.id,
    curriculumId: row.curriculumId,
    domainNodeId: row.domainNodeId,
    depth: row.depth,
    status: row.status,
    source: row.source,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  }));
}

export async function findCurriculumMappedToNode(
  domainNodeId: string,
  db: DbExecutor = getDb(),
): Promise<ExistingCurriculumMatch | null> {
  const row = (
    await db
      .select({ curriculumId: curricula.id, title: curricula.name })
      .from(curriculumDomainNodeMappings)
      .innerJoin(curricula, eq(curricula.id, curriculumDomainNodeMappings.curriculumId))
      .where(
        and(
          eq(curriculumDomainNodeMappings.domainNodeId, domainNodeId),
          ne(curriculumDomainNodeMappings.status, "rejected"),
        ),
      )
      .orderBy(desc(curriculumDomainNodeMappings.createdAt))
      .limit(1)
  )[0];

  return row ? { curriculumId: row.curriculumId, title: row.title } : null;
}

export interface InsertConfirmedMappingParams {
  curriculumId: string;
  domainNodeId: string;
  depth?: DepthLevel | null;
  source: "manual" | "auto";
}

// SCENARIO 5/8/10 — writes an already-confirmed row directly, in one call,
// no suggestion/approval round-trip: the explicit-placement escape hatch
// (source: "manual") and the non-taxonomy-subject auto-placement path
// (source: "auto") both land here.
export async function insertConfirmedMapping(
  params: InsertConfirmedMappingParams,
  db: DbExecutor = getDb(),
): Promise<CurriculumDomainNodeMapping> {
  const id = newId("cdnm");
  const now = new Date();

  await db.insert(curriculumDomainNodeMappings).values({
    id,
    curriculumId: params.curriculumId,
    domainNodeId: params.domainNodeId,
    depth: params.depth ?? null,
    status: "confirmed",
    source: params.source,
    resolvedAt: now,
  });

  const inserted = (
    await db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.id, id))
  )[0]!;

  return toMapping(inserted);
}

export async function insertConfirmedMappingIdempotent(
  params: InsertConfirmedMappingParams,
  db: DbExecutor = getDb(),
): Promise<CurriculumDomainNodeMapping> {
  const existing = await db
    .select()
    .from(curriculumDomainNodeMappings)
    .where(
      and(
        eq(curriculumDomainNodeMappings.curriculumId, params.curriculumId),
        eq(curriculumDomainNodeMappings.domainNodeId, params.domainNodeId),
        ne(curriculumDomainNodeMappings.status, "rejected"),
      ),
    );

  if (existing.length > 0) {
    return toMapping(existing[0]!);
  }

  return insertConfirmedMapping(params, db);
}

export async function listMappingsForCurriculum(
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<CurriculumDomainNodeMapping[]> {
  const rows = await db
    .select()
    .from(curriculumDomainNodeMappings)
    .where(eq(curriculumDomainNodeMappings.curriculumId, curriculumId))
    .orderBy(desc(curriculumDomainNodeMappings.createdAt));

  return rows.map(toMapping);
}

export type ResolveCurriculumDomainMappingError = "not_found" | "already_resolved";

export interface ResolveMappingParams {
  status: "confirmed" | "rejected";
  depth?: DepthLevel;
}

// SCENARIO 4/12 — claim-first accept/reject. This table's own "not yet
// resolved" value is 'suggested' (NOT the literal 'pending' —
// resolveDomainTopicSuggestion/resolveDomainSupersessionSuggestion use that
// literal because it's THEIR status column's vocabulary; no row in this
// table is ever inserted with status = 'pending', so copying that literal
// would make every accept/reject here a permanent no-op — the red-team
// finding this plan was built to avoid). On accept, an explicit depth
// override replaces the AI's originally suggested depth; omitted, the
// suggested depth is kept as-is.
export async function resolveMapping(
  mappingId: string,
  params: ResolveMappingParams,
  db: DbExecutor = getDb(),
): Promise<CurriculumDomainNodeMapping | { error: ResolveCurriculumDomainMappingError }> {
  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(curriculumDomainNodeMappings)
        .where(eq(curriculumDomainNodeMappings.id, mappingId))
    )[0];

    if (!existing) {
      return { error: "not_found" as const };
    }

    const resolvedAt = new Date();
    const nextDepth =
      params.status === "confirmed" ? (params.depth ?? existing.depth) : existing.depth;

    const claimed = (
      await tx
        .update(curriculumDomainNodeMappings)
        .set({ status: params.status, depth: nextDepth, resolvedAt })
        .where(
          and(
            eq(curriculumDomainNodeMappings.id, mappingId),
            eq(curriculumDomainNodeMappings.status, "suggested"),
          ),
        )
        .returning()
    )[0];

    if (!claimed) {
      return { error: "already_resolved" as const };
    }

    return toMapping(claimed);
  });
}

export async function deleteMappingsForCurriculum(
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .delete(curriculumDomainNodeMappings)
    .where(eq(curriculumDomainNodeMappings.curriculumId, curriculumId));
}

// The single-value compatibility read for the legacy Curriculum.domainNodeId
// field (curriculum-placement-panel.tsx) — the most recently confirmed
// mapping for this curriculum, or null if none is confirmed. A curriculum
// confirmed against multiple nodes (SCENARIO 9) has a real, well-defined
// "most recent" placement even though the underlying model is many-to-many;
// CurriculumDetail.domainMappings carries the full list.
export async function getPrimaryConfirmedDomainNodeId(
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const row = (
    await db
      .select({ domainNodeId: curriculumDomainNodeMappings.domainNodeId })
      .from(curriculumDomainNodeMappings)
      .where(
        and(
          eq(curriculumDomainNodeMappings.curriculumId, curriculumId),
          eq(curriculumDomainNodeMappings.status, "confirmed"),
        ),
      )
      .orderBy(desc(curriculumDomainNodeMappings.createdAt))
      .limit(1)
  )[0];

  return row?.domainNodeId ?? null;
}

// Batch counterpart of getPrimaryConfirmedDomainNodeId, for listCurricula()
// — one query for every curriculum on the board, never N+1.
export async function getPrimaryConfirmedDomainNodeIdsByCurriculumIds(
  curriculumIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, string>> {
  if (curriculumIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      curriculumId: curriculumDomainNodeMappings.curriculumId,
      domainNodeId: curriculumDomainNodeMappings.domainNodeId,
      createdAt: curriculumDomainNodeMappings.createdAt,
    })
    .from(curriculumDomainNodeMappings)
    .where(
      and(
        inArray(curriculumDomainNodeMappings.curriculumId, curriculumIds),
        eq(curriculumDomainNodeMappings.status, "confirmed"),
      ),
    );

  const latestByCurriculumId = new Map<string, { domainNodeId: string; createdAt: Date }>();

  for (const row of rows) {
    const current = latestByCurriculumId.get(row.curriculumId);

    if (!current || row.createdAt > current.createdAt) {
      latestByCurriculumId.set(row.curriculumId, {
        domainNodeId: row.domainNodeId,
        createdAt: row.createdAt,
      });
    }
  }

  return new Map(
    Array.from(latestByCurriculumId.entries()).map(([curriculumId, value]) => [
      curriculumId,
      value.domainNodeId,
    ]),
  );
}

// PATCH /curricula/:id { domainNodeId: null } — the "change placement"
// panel's "— unplaced —" option. There is no single column left to null
// out, so "clear" means resolving every currently-confirmed mapping for
// this curriculum to rejected (never deleted — same audit-trail convention
// as every other suggestion table in this codebase).
export async function rejectAllConfirmedForCurriculum(
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(curriculumDomainNodeMappings)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(
      and(
        eq(curriculumDomainNodeMappings.curriculumId, curriculumId),
        eq(curriculumDomainNodeMappings.status, "confirmed"),
      ),
    );
}
