import type http from "node:http";
import { createSubjectCategoryInput, moveCategoryInput, renameCategoryInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { insertCategory, listAllCategories, listCategoriesForSubject, moveCategory, renameCategory } from "./subject-category.repo.js";

export async function handleListSubjectCategories(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  sendJson(res, 200, await listCategoriesForSubject(subjectId));
}

export async function handleListAllSubjectCategories(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listAllCategories());
}

export async function handleCreateSubjectCategory(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    createSubjectCategoryInput.omit({ subjectId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const created = await insertCategory({ ...body.data, subjectId });

  if ("error" in created) {
    if (created.error === "subject_not_found") {
      sendError(res, 404, created.error);
      return;
    }

    sendJson(res, 400, { error: created.error });
    return;
  }

  sendJson(res, 201, created);
}

export async function handleMoveCategory(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  categoryId: string,
): Promise<void> {
  const body = await readJsonBody(req, moveCategoryInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await moveCategory(categoryId, body.data.parentId);

  if ("error" in result) {
    if (result.error === "category_not_found" || result.error === "parent_not_found") {
      sendError(res, 404, result.error);
      return;
    }

    sendJson(res, 400, { error: result.error });
    return;
  }

  sendJson(res, 200, result);
}

export async function handleRenameCategory(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  categoryId: string,
): Promise<void> {
  const body = await readJsonBody(req, renameCategoryInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await renameCategory(categoryId, body.data.name);

  if ("error" in result) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 200, result);
}
