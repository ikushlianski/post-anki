import type http from "node:http";
import { courseRefocusReasonSchema } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import {
  dismissCourseRefocusSuggestion,
  listCourseRefocusSuggestions,
} from "./course-refocus.repo.js";

export async function handleGetCourseRefocusSuggestions(
  res: http.ServerResponse,
): Promise<void> {
  const suggestions = await listCourseRefocusSuggestions();

  sendJson(res, 200, suggestions);
}

// cross-course-refocus-suggestion (issue #70) — `reason` is a URL path
// param, not a request body (see spec.md's Decisions: no dismiss-input
// schema exists). PUT, not PATCH: this is a nested sub-resource
// (`/curricula/:curriculumId/refocus-dismissals/:reason`), idempotent by
// construction — a repeat call is a no-op that reads correctly, matching
// dismissCourseRefocusSuggestion's own upsert semantics (Scenario 11).
export async function handleDismissCourseRefocusSuggestion(
  res: http.ServerResponse,
  curriculumId: string,
  reasonParam: string,
): Promise<void> {
  const parsedReason = courseRefocusReasonSchema.safeParse(reasonParam);

  if (!parsedReason.success) {
    sendJson(res, 400, { error: "invalid_input", message: "invalid reason" });
    return;
  }

  await dismissCourseRefocusSuggestion(curriculumId, parsedReason.data);

  sendJson(res, 200, { curriculumId, reason: parsedReason.data });
}
