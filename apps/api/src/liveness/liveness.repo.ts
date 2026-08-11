import { and, eq, inArray, sql } from "drizzle-orm";
import {
  allowsGeneration,
  computeLiveness,
  isDormant,
  shouldNudge,
  LIVENESS_STARTING_SCORE,
} from "@post-anki/core";
import type {
  LivenessEntityType,
  LivenessRecord,
  LivenessStatus,
  NudgeResponse,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { liveness } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface LivenessRef {
  entityType: LivenessEntityType;
  entityId: string;
}

type LivenessRow = typeof liveness.$inferSelect;

function toRecord(row: LivenessRow): LivenessRecord {
  return {
    id: row.id,
    entityType: row.entityType as LivenessEntityType,
    entityId: row.entityId,
    baseScore: row.score,
    lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
    lastNudgeAt: row.lastNudgeAt ? row.lastNudgeAt.toISOString() : null,
    lastNudgeResponse: (row.lastNudgeResponse as NudgeResponse | null) ?? null,
    createdAt: row.updatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function deriveStatus(
  ref: LivenessRef,
  record: LivenessRecord | null,
  now: string,
): LivenessStatus {
  if (record === null) {
    return {
      entityType: ref.entityType,
      entityId: ref.entityId,
      score: null,
      dormant: false,
      generationAllowed: true,
      nudgeDue: false,
    };
  }

  const score = computeLiveness(
    {
      lastActivityAt: record.lastActivityAt,
      lastNudgeAt: record.lastNudgeAt,
      lastNudgeResponse: record.lastNudgeResponse,
      baseScore: record.baseScore,
    },
    now,
  );
  const dormant = isDormant(record.lastNudgeResponse);

  return {
    entityType: ref.entityType,
    entityId: ref.entityId,
    score,
    dormant,
    generationAllowed: !dormant && allowsGeneration(score),
    nudgeDue: !dormant && shouldNudge(score, record.lastNudgeAt, now),
  };
}

export async function getLivenessRecord(
  ref: LivenessRef,
  db: DbExecutor = getDb(),
): Promise<LivenessRecord | null> {
  const row = (
    await db
      .select()
      .from(liveness)
      .where(and(eq(liveness.entityType, ref.entityType), eq(liveness.entityId, ref.entityId)))
      .limit(1)
  )[0];

  return row ? toRecord(row) : null;
}

export async function readLivenessStatus(
  ref: LivenessRef,
  now: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<LivenessStatus> {
  return deriveStatus(ref, await getLivenessRecord(ref, db), now);
}

export async function readLivenessStatuses(
  refs: LivenessRef[],
  now: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<Map<string, LivenessStatus>> {
  if (refs.length === 0) {
    return new Map();
  }

  const entityIds = Array.from(new Set(refs.map((ref) => ref.entityId)));
  const rows = await db
    .select()
    .from(liveness)
    .where(inArray(liveness.entityId, entityIds));

  const byKey = new Map(rows.map((row) => [refKey(toRef(row)), toRecord(row)]));

  return new Map(
    refs.map((ref) => [refKey(ref), deriveStatus(ref, byKey.get(refKey(ref)) ?? null, now)]),
  );
}

export function refKey(ref: LivenessRef): string {
  return `${ref.entityType}:${ref.entityId}`;
}

function toRef(row: LivenessRow): LivenessRef {
  return { entityType: row.entityType as LivenessEntityType, entityId: row.entityId };
}

export async function startLivenessTracking(
  ref: LivenessRef,
  startedAt: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .insert(liveness)
    .values({
      id: newId("lvns"),
      entityType: ref.entityType,
      entityId: ref.entityId,
      score: LIVENESS_STARTING_SCORE,
      lastActivityAt: new Date(startedAt),
    })
    .onConflictDoNothing({ target: [liveness.entityType, liveness.entityId] });
}

export async function recordLivenessActivity(
  ref: LivenessRef,
  activityAt: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const at = new Date(activityAt);

  const updated = await db
    .update(liveness)
    .set({
      lastActivityAt: sql`GREATEST(COALESCE(${liveness.lastActivityAt}, ${at}), ${at})`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(liveness.entityType, ref.entityType), eq(liveness.entityId, ref.entityId)))
    .returning({ id: liveness.id });

  return updated.length > 0;
}

export async function recordNudgeSent(
  ref: LivenessRef,
  sentAt: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const updated = await db
    .update(liveness)
    .set({ lastNudgeAt: new Date(sentAt), updatedAt: sql`now()` })
    .where(and(eq(liveness.entityType, ref.entityType), eq(liveness.entityId, ref.entityId)))
    .returning({ id: liveness.id });

  return updated.length > 0;
}

export type RecordNudgeResponseError = "not_tracked";

export async function recordNudgeResponse(
  ref: LivenessRef,
  response: NudgeResponse,
  respondedAt: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<LivenessStatus | { error: RecordNudgeResponseError }> {
  const updated = await db
    .update(liveness)
    .set({
      lastNudgeAt: new Date(respondedAt),
      lastNudgeResponse: response,
      updatedAt: sql`now()`,
    })
    .where(and(eq(liveness.entityType, ref.entityType), eq(liveness.entityId, ref.entityId)))
    .returning();

  const row = updated[0];

  if (!row) {
    return { error: "not_tracked" as const };
  }

  return deriveStatus(ref, toRecord(row), respondedAt);
}

export async function listLivenessRecords(
  entityType: LivenessEntityType,
  db: DbExecutor = getDb(),
): Promise<LivenessRecord[]> {
  const rows = await db.select().from(liveness).where(eq(liveness.entityType, entityType));

  return rows.map(toRecord);
}

export async function listDormantEntityIds(
  entityType: LivenessEntityType,
  db: DbExecutor = getDb(),
): Promise<Set<string>> {
  const rows = await db
    .select({ entityId: liveness.entityId })
    .from(liveness)
    .where(and(eq(liveness.entityType, entityType), eq(liveness.lastNudgeResponse, "no")));

  return new Set(rows.map((row) => row.entityId));
}

export async function listNudgeCandidates(
  entityType: LivenessEntityType,
  now: string = new Date().toISOString(),
  db: DbExecutor = getDb(),
): Promise<LivenessStatus[]> {
  const rows = await db.select().from(liveness).where(eq(liveness.entityType, entityType));

  return rows
    .map((row) => deriveStatus(toRef(row), toRecord(row), now))
    .filter((status) => status.nudgeDue);
}
