import { inArray } from "drizzle-orm";
import { STALE_PENDING_TURN_AGE_MS } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { curricula, curriculumStructureTurns } from "../db/schema.js";

// The two statuses where the system itself is supposed to be doing
// automated work with no human input expected — "awaiting_source_approval"
// and "draft" are intentionally excluded, since sitting there is normal
// (the learner hasn't acted yet), not evidence of a stuck agent call.
const STUCK_STATUSES: string[] = ["curating", "shaping_structure"];

// How long a curriculum can sit in a transient status before it's worth
// flagging — generous enough that a normal draft/edit turn (bounded by
// `generateWithRetry`'s retries plus `MAX_TOOL_STEPS` tool calls) always
// finishes well inside it.
const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

export interface StuckCurriculumCandidate {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
}

export interface StructureTurnTimingRow {
  curriculumId: string;
  role: string;
  status: string;
  createdAt: Date;
}

export interface StuckCurriculum {
  id: string;
  name: string;
  status: string;
  stuckForMs: number;
}

/**
 * The stuck/not-stuck decision, split out from the DB fetch in
 * `getStuckCurricula` below so it's unit-testable without mocking drizzle's
 * query builder — this repo has no precedent for testing a function that
 * talks to `getDb()` directly (see `curriculum-rules.ts`/
 * `probe-session.map.ts` for the same split applied elsewhere).
 *
 * A candidate counts as stuck when: (1) its status is one of
 * `STUCK_STATUSES`, (2) the most meaningful timestamp available for it —
 * the latest `curriculum_structure_turns` row if one exists, otherwise the
 * curriculum's own `createdAt` — is older than `STUCK_THRESHOLD_MS`, and (3)
 * it does NOT have a fresh (under `STALE_PENDING_TURN_AGE_MS`) pending assistant
 * turn, since that's normal in-flight work, not a stall. A *stale* pending
 * turn (older than `STALE_PENDING_TURN_AGE_MS`) is not excluded — a pending
 * turn nobody ever came back to finalize is exactly the silent-stall
 * scenario this detector exists to surface.
 */
export function evaluateStuckCurricula(
  candidates: StuckCurriculumCandidate[],
  turnRows: StructureTurnTimingRow[],
  now: Date,
): StuckCurriculum[] {
  const latestTurnAtByCurriculum = new Map<string, Date>();
  const hasFreshPendingTurn = new Set<string>();

  for (const row of turnRows) {
    const existing = latestTurnAtByCurriculum.get(row.curriculumId);

    if (!existing || row.createdAt > existing) {
      latestTurnAtByCurriculum.set(row.curriculumId, row.createdAt);
    }

    if (row.role === "assistant" && row.status === "pending") {
      const ageMs = now.getTime() - row.createdAt.getTime();

      if (ageMs < STALE_PENDING_TURN_AGE_MS) {
        hasFreshPendingTurn.add(row.curriculumId);
      }
    }
  }

  const stuck: StuckCurriculum[] = [];

  for (const candidate of candidates) {
    if (hasFreshPendingTurn.has(candidate.id)) {
      continue;
    }

    const referenceTime = latestTurnAtByCurriculum.get(candidate.id) ?? candidate.createdAt;
    const stuckForMs = now.getTime() - referenceTime.getTime();

    if (stuckForMs > STUCK_THRESHOLD_MS) {
      stuck.push({
        id: candidate.id,
        name: candidate.name,
        status: candidate.status,
        stuckForMs,
      });
    }
  }

  return stuck.sort((a, b) => b.stuckForMs - a.stuckForMs);
}

/**
 * Cheap-to-compute-on-read stuck-curriculum detection — two plain selects
 * (candidates first, then only the structure turns for those candidates),
 * no background job or cache. Called directly from the admin observability
 * endpoint.
 */
export async function getStuckCurricula(now: Date = new Date()): Promise<StuckCurriculum[]> {
  const db = getDb();

  const candidateRows = await db
    .select({
      id: curricula.id,
      name: curricula.name,
      status: curricula.status,
      createdAt: curricula.createdAt,
    })
    .from(curricula)
    .where(inArray(curricula.status, STUCK_STATUSES));

  if (candidateRows.length === 0) {
    return [];
  }

  const turnRows = await db
    .select({
      curriculumId: curriculumStructureTurns.curriculumId,
      role: curriculumStructureTurns.role,
      status: curriculumStructureTurns.status,
      createdAt: curriculumStructureTurns.createdAt,
    })
    .from(curriculumStructureTurns)
    .where(
      inArray(
        curriculumStructureTurns.curriculumId,
        candidateRows.map((c) => c.id),
      ),
    );

  return evaluateStuckCurricula(candidateRows, turnRows, now);
}
