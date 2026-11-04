import type http from "node:http";
import { updateSubjectStudyOptionsInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  readSubjectStudyOptions,
  StudyIntentRefusedError,
  updateSubjectStudyOptions,
} from "./subject-study-options.orchestrator.js";

export async function handleGetSubjectStudyOptions(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const options = await readSubjectStudyOptions(subjectId);

  if (!options) {
    sendError(res, 404, "subject_not_found");
    return;
  }

  sendJson(res, 200, options);
}

export async function handleUpdateSubjectStudyOptions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateSubjectStudyOptionsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const options = await updateSubjectStudyOptions(subjectId, body.data).catch((error: unknown) => {
    if (error instanceof StudyIntentRefusedError) {
      return error;
    }

    throw error;
  });

  if (options instanceof StudyIntentRefusedError) {
    sendError(res, 400, options.code);
    return;
  }

  if (!options) {
    sendError(res, 404, "subject_not_found");
    return;
  }

  sendJson(res, 200, options);
}
