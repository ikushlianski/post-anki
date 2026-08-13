import type http from "node:http";
import { reviewLectureSourceCandidateInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import { compileLecture, gatherLectureSources } from "./lecture.orchestrator.js";
import { getLectureByTopic, startGeneratingLecture } from "./lecture.repo.js";
import { hasCourseOwnSources } from "./course-source-grounding.js";
import {
  listApprovedCandidatesForCompile,
  listLectureSourceCandidates,
  updateCandidateReviewStatus,
} from "./lecture-source-candidate.repo.js";

export async function handleGatherLectureSources(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 201, await gatherLectureSources(topicId));
}

export async function handleListLectureSourceCandidates(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, await listLectureSourceCandidates(topicId));
}

export async function handleReviewLectureSourceCandidate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  candidateId: string,
): Promise<void> {
  const body = await readJsonBody(req, reviewLectureSourceCandidateInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const candidate = await updateCandidateReviewStatus(
    candidateId,
    body.data.reviewStatus,
  );

  if (!candidate) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, candidate);
}

export async function handleCompileLecture(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  const ownSourcesEligible = await hasCourseOwnSources(topicId);

  if (!ownSourcesEligible) {
    const approved = await listApprovedCandidatesForCompile(topicId);

    if (approved.length === 0) {
      sendError(res, 400, "no_approved_sources");
      return;
    }
  }

  const lecture = await startGeneratingLecture(topicId, topic.title);

  sendJson(res, 202, lecture);

  void compileLecture(topicId).catch((err) =>
    log.error({ err, topicId }, "lecture_compile_dispatch_failed"),
  );
}

export async function handleGetLecture(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const lecture = await getLectureByTopic(topicId);

  if (!lecture) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, lecture);
}
