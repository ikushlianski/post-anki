import type http from "node:http";
import {
  createModuleInput,
  reorderInput,
  updateModuleInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  createModule,
  deleteModule,
  reorderModules,
  updateModule,
} from "./module.repo.js";

export async function handleCreateModule(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    createModuleInput.omit({ curriculumId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const module = await createModule({ ...body.data, curriculumId });

  sendJson(res, 201, module);
}

export async function handleUpdateModule(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  moduleId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateModuleInput.omit({ moduleId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await updateModule({ ...body.data, moduleId });

  if (!result) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}

export async function handleDeleteModule(
  res: http.ServerResponse,
  moduleId: string,
): Promise<void> {
  const ok = await deleteModule(moduleId);

  if (!ok) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { id: moduleId, deleted: true });
}

export async function handleReorderModules(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, reorderInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  await reorderModules(body.data.orderedIds);

  sendJson(res, 200, { reordered: body.data.orderedIds.length });
}
