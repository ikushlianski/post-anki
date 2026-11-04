import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type {
  CurriculumDomainNodeMapping,
  CurriculumDomainNodeMappingSource,
  DepthLevel,
  ExistingCurriculumMatch,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, curriculumDomainNodeMappings } from "../db/schema.js";

export function toMapping(
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
