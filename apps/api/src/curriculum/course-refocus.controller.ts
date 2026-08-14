import type http from "node:http";
import { sendJson, sendError } from "../shared/http.js";
import { dismissCourseRefocusSuggestion, listCourseRefocusSuggestions } from "./course-refocus.repo.js";

export async function handleListCourseRefocusSuggestions(res: http.ServerResponse): Promise<void> {
  try {
    const suggestions = await listCourseRefocusSuggestions();
    sendJson(res, 200, suggestions);
  } catch (error) {
    console.error("Error listing course refocus suggestions:", error);
    sendError(res, 500, "internal_error");
  }
}

export async function handleDismissCourseRefocusSuggestion(
  res: http.ServerResponse,
  curriculumId: string,
  reason: string,
): Promise<void> {
  try {
    if (!curriculumId || !reason) {
      sendError(res, 400, "missing_params");
      return;
    }

    await dismissCourseRefocusSuggestion(curriculumId, reason);
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Error dismissing course refocus suggestion:", error);
    sendError(res, 500, "internal_error");
  }
}
