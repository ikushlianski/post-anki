import type http from "node:http";
import { requestStudyMaterialInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import { generateStudyMaterial } from "./study-material.orchestrator.js";
import { insertGeneratingStudyMaterial, listStudyMaterialsForTopic } from "./study-material.repo.js";

export async function handleRequestStudyMaterial(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const body = await readJsonBody(req, requestStudyMaterialInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  const material = await insertGeneratingStudyMaterial(topicId, body.data.kind);

  sendJson(res, 202, material);

  void generateStudyMaterial(material.id, topicId, body.data.kind).catch((err) =>
    log.error({ err, topicId, materialId: material.id }, "study_material_generate_dispatch_failed"),
  );
}

export async function handleListStudyMaterials(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, await listStudyMaterialsForTopic(topicId));
}
