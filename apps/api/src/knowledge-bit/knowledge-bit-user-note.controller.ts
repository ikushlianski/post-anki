import type http from "node:http";
import { setKnowledgeBitUserNoteInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { setKnowledgeBitUserNote } from "./knowledge-bit-user-note.repo.js";

// PUT /knowledge-bits/:id/note
export async function handleSetKnowledgeBitUserNote(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, setKnowledgeBitUserNoteInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await setKnowledgeBitUserNote(id, body.data.note);

  if (!result) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}
