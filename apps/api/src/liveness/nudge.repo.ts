import { and, eq, inArray } from "drizzle-orm";
import { computeLiveness, type NudgeCandidate } from "@post-anki/core";
import type { LearningListItem, LivenessRecord } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula } from "../db/schema.js";
import { listLearningListItemsByIds } from "../learning-list/learning-list.repo.js";
import { listLivenessRecords } from "./liveness.repo.js";

export async function gatherNudgeCandidates(
  now: string = new Date().toISOString(),
): Promise<NudgeCandidate[]> {
  const [curriculumRecords, itemRecords] = await Promise.all([
    listLivenessRecords("curriculum"),
    listLivenessRecords("learning_list_item"),
  ]);

  const [curriculumRows, itemRows] = await Promise.all([
    listConfirmedCurricula(curriculumRecords.map((record) => record.entityId)),
    listLearningListItemsByIds(itemRecords.map((record) => record.entityId)),
  ]);

  const curriculumById = new Map(curriculumRows.map((row) => [row.id, row]));
  const itemById = new Map(itemRows.map((item) => [item.id, item]));

  const curriculumCandidates = curriculumRecords.flatMap((record) => {
    const row = curriculumById.get(record.entityId);

    if (!row) {
      return [];
    }

    return [toCandidate(record, row.name, row.subjectId, now)];
  });

  const itemCandidates = itemRecords.flatMap((record) => {
    const item = itemById.get(record.entityId);

    if (!item) {
      return [];
    }

    return [toCandidate(record, nameOf(item), item.recommendation?.subjectId ?? null, now)];
  });

  return [...curriculumCandidates, ...itemCandidates];
}

function toCandidate(
  record: LivenessRecord,
  name: string,
  groupKey: string | null,
  now: string,
): NudgeCandidate {
  return {
    entityType: record.entityType,
    entityId: record.entityId,
    name,
    score: computeLiveness(
      {
        lastActivityAt: record.lastActivityAt,
        lastNudgeAt: record.lastNudgeAt,
        lastNudgeResponse: record.lastNudgeResponse,
        baseScore: record.baseScore,
      },
      now,
    ),
    lastNudgeAt: record.lastNudgeAt,
    lastNudgeResponse: record.lastNudgeResponse,
    groupKey,
  };
}

function nameOf(item: LearningListItem): string {
  return item.title ?? item.url ?? "Captured item";
}

async function listConfirmedCurricula(
  curriculumIds: string[],
): Promise<{ id: string; name: string; subjectId: string }[]> {
  if (curriculumIds.length === 0) {
    return [];
  }

  return getDb()
    .select({ id: curricula.id, name: curricula.name, subjectId: curricula.subjectId })
    .from(curricula)
    .where(and(inArray(curricula.id, curriculumIds), eq(curricula.status, "confirmed")));
}
