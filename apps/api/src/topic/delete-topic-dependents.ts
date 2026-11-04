import { inArray } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import {
  gaps,
  openQuestions,
  socraticSessions,
  socraticTurns,
  studyItemFeedback,
  studyMaterials,
  topicRecommendations,
} from "../db/schema.js";
import { deleteCardsForTopic } from "../cards/cards.repo.js";
import { deleteGapArchetypeStateForGapIds } from "../gap/gap-archetype.repo.js";
import { deleteGapMasteryForGapIds } from "../gap/gap-mastery.repo.js";
import { deleteLectureForTopic } from "../lecture/lecture.repo.js";
import { deleteLectureSourceCandidatesForTopic } from "../lecture/lecture-source-candidate.repo.js";

export async function deleteTopicDependents(topicIds: string[], tx: DbExecutor): Promise<void> {
  if (topicIds.length === 0) {
    return;
  }

  const gapRows = await tx
    .select({ id: gaps.id })
    .from(gaps)
    .where(inArray(gaps.topicId, topicIds));
  const gapIds = gapRows.map((g) => g.id);

  await deleteGapMasteryForGapIds(gapIds, tx);
  await deleteGapArchetypeStateForGapIds(gapIds, tx);
  await tx.delete(gaps).where(inArray(gaps.topicId, topicIds));

  const sessionRows = await tx
    .select({ id: socraticSessions.id })
    .from(socraticSessions)
    .where(inArray(socraticSessions.topicId, topicIds));
  const sessionIds = sessionRows.map((s) => s.id);

  if (sessionIds.length > 0) {
    await tx.delete(socraticTurns).where(inArray(socraticTurns.sessionId, sessionIds));
    await tx.delete(socraticSessions).where(inArray(socraticSessions.id, sessionIds));
  }

  await tx.delete(studyMaterials).where(inArray(studyMaterials.topicId, topicIds));
  await tx.delete(openQuestions).where(inArray(openQuestions.topicId, topicIds));
  await tx.delete(studyItemFeedback).where(inArray(studyItemFeedback.topicId, topicIds));
  await tx.delete(topicRecommendations).where(inArray(topicRecommendations.topicId, topicIds));

  for (const topicId of topicIds) {
    await deleteLectureForTopic(topicId, tx);
    await deleteLectureSourceCandidatesForTopic(topicId, tx);
    await deleteCardsForTopic(topicId, tx);
  }
}
