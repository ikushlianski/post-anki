import { inArray } from "drizzle-orm";
import { collectSubjectSubtreeIds, type SubjectHierarchyRow } from "@post-anki/core";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitSchedules } from "../db/schema.js";
import { getLocalDayWindow } from "./knowledge-bit-review.repo.js";
import { listScopedCards, type StepsFor } from "./knowledge-bit-review-queue-cards.repo.js";
import { interleaveNewWithSeen } from "./knowledge-bit-review-queue-mix.js";
import { readSubjectActivity } from "./knowledge-bit-review-queue-parent-activity.repo.js";
import {
  groupWeights,
  poolSize,
  selectTiered,
  splitBalance,
  type MixCandidate,
} from "./knowledge-bit-review-queue-parent-mix.js";
import { scopeCondition } from "./knowledge-bit-review-queue-picked.repo.js";
import type {
  KnowledgeBitReviewCardRow,
  KnowledgeBitReviewCardsFilter,
  KnowledgeBitReviewQueueClock,
} from "./knowledge-bit-review-queue.repo.js";

interface ParentMixInput {
  rootId: string;
  subjectRows: SubjectHierarchyRow[];
  limit: number;
  clock: KnowledgeBitReviewQueueClock;
  filter: KnowledgeBitReviewCardsFilter;
  db: DbExecutor;
  stepsFor: StepsFor;
}

interface SubjectGroup {
  key: string;
  ids: string[];
}

// Each direct child's whole subtree is one group; the parent's own cards are another.
function buildGroups(rootId: string, rows: SubjectHierarchyRow[]): SubjectGroup[] {
  const children = rows.filter((row) => row.parentId === rootId && row.id !== rootId);
  const childGroups = children.map((child) => ({
    key: child.id,
    ids: collectSubjectSubtreeIds(child.id, rows).filter((id) => id !== rootId),
  }));

  return [{ key: rootId, ids: [rootId] }, ...childGroups];
}

const tagged = (group: string, cards: KnowledgeBitReviewCardRow[]): MixCandidate<KnowledgeBitReviewCardRow>[] =>
  cards.map((card) => ({ id: card.variantId, group, item: card }));

async function readNotYetDue(
  cards: KnowledgeBitReviewCardRow[],
  now: Date,
  db: DbExecutor,
): Promise<Set<string>> {
  if (cards.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({
      bitId: knowledgeBitSchedules.knowledgeBitId,
      cardKey: knowledgeBitSchedules.cardKey,
      dueAt: knowledgeBitSchedules.dueAt,
    })
    .from(knowledgeBitSchedules)
    .where(inArray(knowledgeBitSchedules.knowledgeBitId, [...new Set(cards.map((card) => card.knowledgeBitId))]));

  return new Set(
    rows.filter((row) => row.dueAt.getTime() > now.getTime()).map((row) => `${row.bitId}:${row.cardKey}`),
  );
}

// Null when fewer than two groups hold cards, so the caller keeps the plain subject order.
export async function listParentMixCards(input: ParentMixInput): Promise<KnowledgeBitReviewCardRow[] | null> {
  const { rootId, subjectRows, limit, clock, filter, db, stepsFor } = input;
  const groups = buildGroups(rootId, subjectRows);

  if (groups.length < 2 || limit <= 0) {
    return null;
  }

  const { startsAt: dayStart } = await getLocalDayWindow(clock.tz, clock.now, db);
  const pool = poolSize(limit);
  const [activity, pools] = await Promise.all([
    readSubjectActivity(db, dayStart),
    Promise.all(
      groups.map(async (group) => {
        const scope = scopeCondition(filter, db, group.ids);

        if (!scope) {
          return { key: group.key, seen: [], fresh: [] };
        }

        const [seen, fresh] = await Promise.all([
          listScopedCards(pool, scope, filter, clock.now, db, stepsFor, "seen"),
          listScopedCards(pool, scope, filter, clock.now, db, stepsFor, "new"),
        ]);

        return { key: group.key, seen, fresh };
      }),
    ),
  ]);

  if (pools.filter((entry) => entry.seen.length + entry.fresh.length > 0).length < 2) {
    return null;
  }

  const weights = new Map(
    groupWeights(
      groups.map((group) => group.ids.reduce((sum, id) => sum + (activity.get(id) ?? 0), 0)),
    ).map((weight, index) => [groups[index]!.key, weight]),
  );
  const seedBase = `${rootId}:${dayStart.toISOString()}`;
  const weightOf = (group: string) => weights.get(group) ?? 1;
  const seenCandidates = pools.flatMap((entry) => tagged(entry.key, entry.seen));
  const freshCandidates = pools.flatMap((entry) => tagged(entry.key, entry.fresh));
  const share = splitBalance(limit, seenCandidates.length, freshCandidates.length);
  const notYetDue = await readNotYetDue(
    seenCandidates.map((candidate) => candidate.item),
    clock.now,
    db,
  );
  const isWaiting = (candidate: MixCandidate<KnowledgeBitReviewCardRow>) =>
    notYetDue.has(`${candidate.item.knowledgeBitId}:${candidate.item.cardKey ?? ""}`);
  const seen = selectTiered(
    [seenCandidates.filter((candidate) => !isWaiting(candidate)), seenCandidates.filter(isWaiting)],
    weightOf,
    `${seedBase}:seen`,
    share.seen,
  );
  const fresh = selectTiered([freshCandidates], weightOf, `${seedBase}:new`, share.fresh);

  return interleaveNewWithSeen(seen, fresh, limit);
}
