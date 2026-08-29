import type http from "node:http";
import { createSubjectCategoryInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { insertCategory, listAllCategories, listCategoriesForSubject } from "./subject-category.repo.js";

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
