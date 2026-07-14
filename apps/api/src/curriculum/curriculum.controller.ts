import type http from "node:http";
import {
  addSourcesInput,
  createCurriculumInput,
  updateCurriculumInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getSubject } from "../subject/subject.repo.js";
import {
  confirmCurriculum,
  createCurriculum,
  deleteCurriculum,
  getCurriculum,
  getCurriculumDetail,
  listCurricula,
  updateCurriculum,
} from "./curriculum.repo.js";
import { isSourceMandateUnmet } from "./curriculum-rules.js";
import {
  mergeSourcesIntoCurriculum,
  parseCurriculum,
  reparseCurriculum,
} from "./curriculum-parse.orchestrator.js";

export async function handleListCurricula(
  res: http.ServerResponse,
  subjectId: string | null,
): Promise<void> {
  sendJson(res, 200, await listCurricula(subjectId ?? undefined));
}

export async function handleCreateCurriculum(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createCurriculumInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const sources = body.data.sources ?? [];
  const subject = await getSubject(body.data.subjectId);

  if (!subject) {
    sendError(res, 404, "subject_not_found");
    return;
  }

  if (isSourceMandateUnmet(subject.requireSources, sources.length)) {
    sendError(
      res,
      400,
      "sources_required",
      "this subject requires at least one source for every curriculum",
    );
    return;
  }

  const curriculum = await createCurriculum({ ...body.data, sources });

  sendJson(res, 202, curriculum);

  void parseCurriculum(curriculum.id).catch((err) =>
    log.error({ err, curriculumId: curriculum.id }, "parse_dispatch_failed"),
  );
}

export async function handleDeleteCurriculum(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const ok = await deleteCurriculum(curriculumId);

  if (!ok) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { id: curriculumId, deleted: true });
}

export async function handleGetCurriculum(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const detail = await getCurriculumDetail(curriculumId);

  if (!detail) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, detail);
}

export async function handleConfirmCurriculum(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const result = await confirmCurriculum(curriculumId);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result === "not_ready") {
    sendError(
      res,
      409,
      "not_ready",
      "curriculum must be curated (status ready) before it can be confirmed",
    );
    return;
  }

  sendJson(res, 200, result);
}

export async function handleAddSources(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    addSourcesInput.omit({ curriculumId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void mergeSourcesIntoCurriculum(curriculumId, body.data.sources).catch((err) =>
    log.error({ err, curriculumId }, "merge_dispatch_failed"),
  );
}

export async function handleReparse(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status === "curating") {
    sendError(res, 409, "already_curating");
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void reparseCurriculum(curriculumId).catch((err) =>
    log.error({ err, curriculumId }, "reparse_dispatch_failed"),
  );
}

export async function handleUpdateCurriculum(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    updateCurriculumInput.omit({ curriculumId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await updateCurriculum({ ...body.data, curriculumId });

  if (!result) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}
