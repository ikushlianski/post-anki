import type http from "node:http";
import { collectDescendantNodeIds, nextPathStep, pathProgress, selectDailyPush } from "@post-anki/core";
import { createLearningPathInput, updateLearningPathInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { buildProbeQuestionForGap } from "../probe/probe.service.js";
import { createLearningPathFromTemplate } from "./learning-path-creation.orchestrator.js";
import {
  listRoleTemplateDefinitions,
  resolveRoleTemplateTargets,
  WEB_DEVELOPMENT_SUBJECT_NAME,
} from "./role-templates.js";
import {
  abandonLearningPath,
  gatherPathProgressInputs,
  gatherStepPushCandidates,
  getLearningPath,
  getSubjectIdByName,
  listLearningPaths,
  listNamedNodesForSubject,
  markLearningPathCompletedIfDue,
} from "./learning-path.repo.js";

export async function handleListRoleTemplates(res: http.ServerResponse): Promise<void> {
  const subjectId = await getSubjectIdByName(WEB_DEVELOPMENT_SUBJECT_NAME);

  if (!subjectId) {
    sendJson(res, 200, []);
    return;
  }

  const nodes = await listNamedNodesForSubject(subjectId);

  const templates = listRoleTemplateDefinitions().flatMap((definition) => {
    try {
      const targets = resolveRoleTemplateTargets(definition, nodes);

      return [
        {
          id: definition.id,
          name: definition.name,
          targetRoleLabel: definition.targetRoleLabel,
          targets,
        },
      ];
    } catch (err) {
      log.warn({ err, roleTemplateId: definition.id }, "role_template_unresolvable");

      return [];
    }
  });

  sendJson(res, 200, templates);
}

export async function handleCreateLearningPath(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createLearningPathInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  try {
    const result = await createLearningPathFromTemplate(body.data.roleTemplateId);

    if ("error" in result) {
      if (result.error === "role_template_not_found") {
        sendError(res, 404, "role_template_not_found");
        return;
      }

      sendError(res, 404, "subject_not_found");
      return;
    }

    sendJson(res, 201, result);
  } catch (err) {
    log.error({ err, roleTemplateId: body.data.roleTemplateId }, "learning_path_creation_failed");

    const message = err instanceof Error ? err.message : "learning path creation failed";

    sendError(res, 422, "unresolved_target", message);
  }
}

export async function handleListLearningPaths(
  res: http.ServerResponse,
  statusParam: string | null,
): Promise<void> {
  const paths = await listLearningPaths({ excludeAbandoned: statusParam === "active" });

  sendJson(res, 200, paths);
}

export async function handleGetLearningPath(res: http.ServerResponse, pathId: string): Promise<void> {
  const record = await getLearningPath(pathId);

  if (!record) {
    sendError(res, 404, "not_found");
    return;
  }

  const { nodes, curriculumTopics } = await gatherPathProgressInputs(
    record.steps.map((step) => step.domainNodeId),
  );

  const progress = pathProgress(record.steps, nodes, curriculumTopics);
  const nextStepDomainNodeId = nextPathStep(progress.steps);

  let path = record.path;

  if (progress.overallStatus === "done" && path.status === "active" && !path.completedAt) {
    const completedAt = new Date();

    await markLearningPathCompletedIfDue(pathId, completedAt);

    path = { ...path, status: "completed", completedAt: completedAt.toISOString() };
  }

  sendJson(res, 200, { path, steps: record.steps, progress, nextStepDomainNodeId });
}

export async function handleAbandonLearningPath(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateLearningPathInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await abandonLearningPath(pathId);

  if (!updated) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, updated);
}

export async function handleGetLearningPathStepPush(
  res: http.ServerResponse,
  pathId: string,
  stepDomainNodeId: string,
): Promise<void> {
  const record = await getLearningPath(pathId);

  if (!record) {
    sendError(res, 404, "not_found");
    return;
  }

  if (!record.steps.some((step) => step.domainNodeId === stepDomainNodeId)) {
    sendError(res, 404, "step_not_found");
    return;
  }

  const { nodes } = await gatherPathProgressInputs(record.steps.map((step) => step.domainNodeId));
  const subtreeNodeIds = collectDescendantNodeIds(stepDomainNodeId, nodes);
  const candidates = await gatherStepPushCandidates(subtreeNodeIds);

  const now = new Date().toISOString();
  const pick = selectDailyPush(candidates, now);
  const question = pick ? await buildProbeQuestionForGap(pick.topicId, pick.gap, "socratic") : null;

  sendJson(res, 200, { push: pick, question });
}
