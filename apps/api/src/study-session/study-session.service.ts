import type {
  QuestionKind,
  StudySession,
  StudySessionConsistency,
  StudySessionListItem,
  StudySessionPushResponse,
  StudySessionTargetType,
} from "@post-anki/shared";
import { collectDescendantNodeIds, isSessionMissed, scopeSessionCandidates, selectDailyPush, sessionConsistency } from "@post-anki/core";
import { buildProbeQuestionForGap } from "../probe/probe.service.js";
import { gatherPushCandidates } from "../push/push.repo.js";
import { recordActivityToday } from "../streak/streak.service.js";
import { getDomainNode, listDomainNodesForSubject } from "../domain-map/domain-map.repo.js";
import { gatherPathProgressInputs, getLearningPath } from "../learning-path/learning-path.repo.js";
import {
  endStudySession,
  getStudySession,
  listSessionsForConsistency,
  listStudySessions,
  resolveCurriculumIdsForDomainNodeIds,
} from "./study-session.repo.js";

export async function resolveScopedCurriculumIds(
  targetType: StudySessionTargetType | null,
  targetId: string | null,
): Promise<string[] | null> {
  if (!targetType || !targetId) {
    return null;
  }

  if (targetType === "curriculum") {
    return [targetId];
  }

  if (targetType === "domain_node") {
    const node = await getDomainNode(targetId);

    if (!node) {
      return [];
    }

    const nodes = await listDomainNodesForSubject(node.subjectId);
    const subtreeIds = collectDescendantNodeIds(
      targetId,
      nodes.map((n) => ({ id: n.id, parentId: n.parentId })),
    );

    return resolveCurriculumIdsForDomainNodeIds(subtreeIds);
  }

  const record = await getLearningPath(targetId);

  if (!record) {
    return [];
  }

  const { nodes } = await gatherPathProgressInputs(record.steps.map((step) => step.domainNodeId));
  const subtreeIds = [
    ...new Set(
      record.steps.flatMap((step) => collectDescendantNodeIds(step.domainNodeId, nodes)),
    ),
  ];

  return resolveCurriculumIdsForDomainNodeIds(subtreeIds);
}

export type GetSessionPushError = "not_found";

export async function getSessionPush(
  sessionId: string,
  excludeGapIds: string[],
  mode: QuestionKind,
  now: string,
): Promise<StudySessionPushResponse | { error: GetSessionPushError }> {
  const session = await getStudySession(sessionId);

  if (!session) {
    return { error: "not_found" };
  }

  const [candidates, scopedCurriculumIds] = await Promise.all([
    gatherPushCandidates(),
    resolveScopedCurriculumIds(session.targetType, session.targetId),
  ]);

  const scoped = scopeSessionCandidates(candidates, scopedCurriculumIds, excludeGapIds);
  const pick = selectDailyPush(scoped, now);
  const question = pick ? await buildProbeQuestionForGap(pick.topicId, pick.gap, mode) : null;

  return { push: pick, question };
}

export async function completeSession(id: string, now: Date): Promise<StudySession | null> {
  const session = await endStudySession(id, now);

  if (session && session.status === "completed") {
    await recordActivityToday(now.toISOString());
  }

  return session;
}

export async function getConsistency(
  now: string,
  windowDays?: number,
): Promise<StudySessionConsistency> {
  const sessions = await listSessionsForConsistency();

  return sessionConsistency(sessions, now, windowDays);
}

export async function listSessionsForSchedule(now: string): Promise<StudySessionListItem[]> {
  const sessions = await listStudySessions();

  return sessions.map((session) => ({
    ...session,
    missed: isSessionMissed(session.status, session.scheduledFor, now),
  }));
}
